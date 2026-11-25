"""Manage independent probes, freshness, history and notification delivery."""
import asyncio
import logging
from dataclasses import dataclass
from time import monotonic, time

import aiohttp
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.storage import Store

from .network import PublicResolver, feed_update, probe, public_url
from .polling import next_slot, poll_offset
from .status import DAY, summarize

LOGGER = logging.getLogger(__name__)
CONTROLS = ("https://www.cloudflare.com/cdn-cgi/trace", "https://connectivitycheck.gstatic.com/generate_204")

@dataclass
class DeliveryAttempt:
    delay: int = 0
    retry_at: float = 0


class Monitor:
    def __init__(self, hass, entry, catalog):
        self.hass = hass
        self.entry = entry
        self.catalog = {item["id"]: item for item in catalog}
        self.catalog_by_url = {
            public_url(item["url"]): item for item in catalog if item.get("url")
        }
        self.interval = entry.options.get("scan_interval", 300)
        self.notify_action = entry.options.get("notify_service")
        self.store = Store(hass, 1, f"outage_watch.{entry.entry_id}")
        self.services = {}
        self.tasks = {}
        self.entity_states = {}
        self.pending_alerts = {}
        self.control_task = None
        self.control_cooldowns = {}
        self.control = None
        self.failures = 0
        self.generation = 0
        self.resolver = PublicResolver()
        self.session = None
        self.lock = asyncio.Lock()

    async def load(self):
        data = await self.store.async_load() or {}
        self.services = data.get("services", {})
        for service in self.services.values():
            self.apply_catalog_metadata(service)
            self.prune(service)
            # Older observations predate the optional polling interval.
            for sample in service["samples"]:
                if len(sample) == 3:
                    sample.append(self.interval)
            # The baseline survives restart. Failure streaks require fresh evidence.
            service["run_start"] = time()

    def catalog_item(self, service):
        item = self.catalog.get(service["id"])
        if item or not service.get("url"):
            return item
        return self.catalog_by_url.get(public_url(service["url"]))

    def apply_catalog_metadata(self, service):
        item = self.catalog_item(service)
        if item:
            if item.get("feed") != service.get("feed"):
                service.pop("feed", None)
                service.pop("provider", None)
                service.pop("feed_retry_at", None)
            for field in ("feed", "official", "crowd", "feed_scope", "icon"):
                if item.get(field):
                    service[field] = item[field]

    def prune(self, service):
        cutoff = time() - DAY
        service["samples"] = [row for row in service.get("samples", []) if row[0] > cutoff][-1440:]

    def save(self):
        self.store.async_delay_save(lambda: {"services": self.services}, 5)

    @property
    def change(self):
        return f"outage_watch_{self.entry.entry_id}_change"

    def service_change(self, service_id):
        return f"{self.change}_{service_id}"

    def publish_state(self, service):
        state = self.state(service)
        key = service["id"]
        if state != self.entity_states.get(key):
            self.entity_states[key] = state
            async_dispatcher_send(self.hass, self.service_change(key))
        return state

    @property
    def added(self):
        return f"outage_watch_{self.entry.entry_id}_added"

    def start(self):
        self.session = aiohttp.ClientSession(
            connector=aiohttp.TCPConnector(resolver=self.resolver, limit=8),
            timeout=aiohttp.ClientTimeout(total=10),
            cookie_jar=aiohttp.DummyCookieJar(),
            headers={"User-Agent": "OutageMap/0.2.14 (+https://github.com/yanke7/Home-Assistant)"},
        )
        for service in self.services.values():
            self.schedule(service)

    def schedule(self, service):
        self.entity_states[service["id"]] = self.state(service)
        if self.control_task is None:
            self.control_task = asyncio.create_task(self.watch_connection())
        self.tasks[service["id"]] = asyncio.create_task(self.watch(service))

    def add(self, service):
        self.apply_catalog_metadata(service)
        service.update(samples=[], run_start=time())
        self.services[service["id"]] = service
        async_dispatcher_send(self.hass, self.added, service["id"])
        self.schedule(service)

    async def remove(self, service_id):
        task = self.tasks.pop(service_id)
        self.services.pop(service_id)
        self.entity_states.pop(service_id, None)
        self.pending_alerts.pop(service_id, None)
        tasks = [task]
        if not self.services and self.control_task is not None:
            tasks.append(self.control_task)
            self.control_task = None
            self.control = None
            self.failures = 0
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        registry = er.async_get(self.hass)
        for domain, kind in (("sensor", "status"), ("sensor", "response_time"), ("binary_sensor", "problem")):
            entity_id = registry.async_get_entity_id(domain, "outage_watch", self.unique(service_id, kind))
            if entity_id:
                registry.async_remove(entity_id)

    def unique(self, service_id, kind):
        return f"{self.entry.entry_id}_{service_id}_{kind}"

    async def close(self):
        tasks = list(self.tasks.values())
        if self.control_task is not None:
            tasks.append(self.control_task)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await self.session.close()
        await self.resolver.close()
        await self.store.async_save({"services": self.services})

    async def watch_connection(self):
        offset = poll_offset(self.entry.entry_id, "connectivity", 30)
        now = time()
        await asyncio.sleep(next_slot(now, 30, offset) - now)
        while True:
            reachable = False
            attempted = False
            for url in CONTROLS:
                if time() < self.control_cooldowns.get(url, 0):
                    continue
                attempted = True
                outcome, _, _, self.control_cooldowns[url] = await probe(self.session, url)
                if outcome == "ok":
                    reachable = True
                    break
            resumed = reachable and self.failures > 0
            if attempted:
                self.failures = 0 if reachable else self.failures + 1
            previous = self.control
            if reachable:
                self.control = True
            elif self.failures >= 2:
                self.control = False
            # A single failed round pauses service checks without declaring an outage.
            if resumed or self.control != previous:
                self.generation += 1
            if self.control != previous:
                for service in self.services.values():
                    service["run_start"] = time()
                    self.publish_state(service)
                async_dispatcher_send(self.hass, self.change)
            await asyncio.sleep(30)

    def state(self, service):
        now = time()
        samples = [] if service.get("paused") else service.get("samples", [])
        cached = service.get("provider") or {}
        checked = cached.get("checked", 0)
        feed = cached.get("data", {}) if checked > now - self.interval * 3 else {}
        status, reason, baseline = summarize(
            samples, feed, self.control, now, self.interval * 5, service.get("run_start", 0)
        )
        latest = samples[-1] if samples else None
        return {
            "status": status, "reason": reason, "baseline": baseline,
            "latency": latest[2] if self.control and latest and latest[0] > now - self.interval * 5 else None,
            "checked": latest[0] if latest else None, "feed_checked": checked or None,
            "feed_fresh": bool(feed),
            "paused": bool(service.get("paused")),
            "signal": ("Feed only" if service.get("feed") else "Checks paused") if service.get("paused") else
                      "Feed + checks" if service.get("feed") and service.get("url") else
                      "Feed only" if service.get("feed") else "Checks only",
            **{key: feed.get(key) for key in ("incident", "components", "maintenance")},
        }

    def snapshot(self, admin, can_read):
        connectivity_visible = admin or can_read("binary_sensor", "internet", "connectivity")
        services = []
        for service in self.services.values():
            service_id = service["id"]
            if not admin and not can_read("sensor", service_id, "status"):
                continue
            item = {key: service.get(key) for key in ("id", "name", "official", "crowd", "icon", "feed_scope")}
            item["category"] = (self.catalog_item(service) or {}).get("category", "Custom")
            item.update(self.state(service))
            if not connectivity_visible and item.get("reason") == "internet_down":
                item["reason"] = None
            if admin or can_read("sensor", service_id, "response_time"):
                item["history"] = [row for row in service["samples"] if row[0] > time() - DAY]
            else:
                for key in ("latency", "baseline"):
                    item.pop(key, None)
            if admin:
                item["alerts"] = service.get("alerts")
                item["can_pause"] = bool(service.get("url"))
            services.append(item)

        result = {"can_manage": admin, "services": services}
        if connectivity_visible:
            result["connected"] = self.control
        if admin:
            tracked_catalog = {
                item["id"] for service in self.services.values()
                if (item := self.catalog_item(service))
            }
            result["notify_configured"] = bool(self.notify_action)
            result["catalog"] = [{key: item[key] for key in ("name", "id", "category")} for item in self.catalog.values()
                                 if item["id"] not in tracked_catalog]
        return result

    async def watch(self, service):
        offset = poll_offset(self.entry.entry_id, service["id"], self.interval)
        feed_due = check_due = 0
        feed_backoff = check_backoff = 1
        generation = None
        while True:
            now = time()
            if generation != self.generation:
                # Rephase after reconnect without shortening an existing wait.
                feed_due = max(feed_due, next_slot(now, self.interval, offset,
                                                   retry_at=service.get("feed_retry_at", 0)))
                check_due = max(check_due, next_slot(now, self.interval, offset,
                                                     retry_at=service.get("probe_retry_at", 0)))
                generation = self.generation
            changed = False
            if self.control is True and self.failures == 0:
                if service.get("feed") and now >= feed_due:
                    current, retry_at = await feed_update(self.session, service["feed"], service.get("provider") or {})
                    service["feed_retry_at"] = retry_at
                    feed_backoff = 1 if current else min(4, feed_backoff * 2)
                    feed_due = next_slot(time(), self.interval, offset, feed_backoff, retry_at)
                    changed = True
                    if current and generation == self.generation and self.failures == 0:
                        service["provider"] = {**current, "checked": time()}
                if (service.get("url") and not service.get("paused") and now >= check_due
                        and generation == self.generation and self.failures == 0):
                    run_start = service.get("run_start")
                    outcome, latency, code, retry_at = await probe(self.session, service["url"])
                    service["probe_retry_at"] = retry_at
                    changed = True
                    if generation == self.generation and self.failures == 0 and not service.get("paused") and run_start == service.get("run_start"):
                        service["samples"].append([time(), outcome, latency, self.interval])
                        self.prune(service)
                        if code == 429:
                            check_backoff = 4
                        elif outcome == "failed" and self.state(service)["reason"] == "unreachable":
                            check_backoff = min(4, check_backoff * 2)
                        else:
                            check_backoff = 1
                    check_due = next_slot(time(), self.interval, offset, check_backoff, retry_at)
                if changed:
                    self.save()
            state = self.publish_state(service)
            await self.notify(service, state["status"])
            deadlines = [due for due in (feed_due, check_due) if due > time()]
            await asyncio.sleep(min(15, max(1, min(deadlines, default=time() + 5) - time())))

    def set_alerts(self, service, enabled):
        if enabled != service.get("alerts", False):
            self.pending_alerts.pop(service["id"], None)
            service.pop("alert_open", None)
            service["alerts"] = enabled

    async def notify(self, service, status):
        if not (service.get("alerts") and self.notify_action and self.control and self.failures == 0):
            return
        key = service["id"]
        prior = service.get("alert_open", False)
        if status not in ("outage", "operational"):
            return
        if (status == "outage") == prior:
            # A failed opening (or recovery) delivery has been overtaken by events.
            self.pending_alerts.pop(key, None)
            return
        attempt = self.pending_alerts.get(key)
        if attempt is None:
            attempt = self.pending_alerts[key] = DeliveryAttempt()
        if monotonic() < attempt.retry_at:
            return
        action = self.notify_action.split(".", 1)[1]
        label = "recovered" if prior else (
            "is unreachable from Home Assistant" if self.state(service)["reason"] == "unreachable"
            else "has a provider-reported outage"
        )
        if self.hass.services.has_service("notify", action):
            try:
                await self.hass.services.async_call("notify", action, {
                    "title": "Outage Map", "message": f"{service['name']} {label}."
                }, blocking=True)
            except Exception:
                LOGGER.exception("Could not deliver Outage Map notification")
            else:
                # Disabling alerts or removing the service invalidates an in-flight attempt.
                if self.pending_alerts.get(key) is attempt:
                    self.pending_alerts.pop(key)
                    service["alert_open"] = status == "outage"
                    self.save()
                return
        attempt.delay = min(900, max(30, 2 * attempt.delay))
        attempt.retry_at = monotonic() + attempt.delay
