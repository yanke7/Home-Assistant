"""Home Assistant entry points and admin management actions."""
import asyncio
import json
from pathlib import Path
from time import time
from uuid import uuid4

import voluptuous as vol
from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.helpers import entity_registry as er
from homeassistant.components import frontend, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.service import async_register_admin_service

from .monitor import Monitor
from .network import public_url
from .readouts import SENSORS, async_enable_readouts, entity_ids

DOMAIN = "outage_watch"
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
WWW = Path(__file__).parent / "www"
PLATFORMS = ["sensor", "binary_sensor"]

@websocket_api.websocket_command({vol.Required("type"): "outage_watch/dashboard"})
@websocket_api.async_response
async def dashboard(hass, connection, msg):
    entries = hass.config_entries.async_loaded_entries(DOMAIN)
    if not entries:
        connection.send_error(msg["id"], "not_loaded", "Set up Outage Map first")
        return
    monitor = entries[0].runtime_data
    user = connection.user
    registry = er.async_get(hass)

    def can_read(domain, service_id, kind):
        entity_id = registry.async_get_entity_id(domain, DOMAIN, monitor.unique(service_id, kind))
        return bool(entity_id and user.permissions.check_entity(entity_id, POLICY_READ))

    snapshot = monitor.snapshot(user.is_admin, can_read)
    snapshot["readout_entities"] = {
        provider: {
            key: entity_id for key, entity_id in entity_ids(hass, provider).items()
            if user.permissions.check_entity(entity_id, POLICY_READ)
        }
        for provider in SENSORS
    }
    snapshot["speedtest_configured"] = bool(hass.config_entries.async_entries("speedtestdotnet"))
    connection.send_result(msg["id"], snapshot)

async def async_setup(hass, config):
    await hass.http.async_register_static_paths([
        StaticPathConfig("/outage_watch/outage-watch-card.js", str(WWW / "outage-watch-card.js"), False),
        StaticPathConfig("/outage_watch/star-trek-badge.jpg", str(WWW / "outage-map-star-trek-badge.jpg"), True),
    ])
    frontend.add_extra_js_url(hass, "/outage_watch/outage-watch-card.js?v=0.2.14")
    websocket_api.async_register_command(hass, dashboard)

    async def manage(call):
        """Track, remove, or configure a service."""
        entries = hass.config_entries.async_loaded_entries(DOMAIN)
        if not entries:
            raise HomeAssistantError("Set up Outage Map first")
        monitor = entries[0].runtime_data
        async with monitor.lock:
            data = call.data
            if call.service == "add_service":
                if "catalog_id" in data and not {"url", "name"}.intersection(data):
                    service = monitor.catalog.get(data["catalog_id"])
                    if not service:
                        raise HomeAssistantError("Unknown catalog service")
                    service = dict(service)
                elif "catalog_id" not in data and data.get("name", "").strip() and data.get("url"):
                    try:
                        url = str(public_url(data["url"]))
                    except ValueError as exc:
                        raise HomeAssistantError(str(exc)) from exc
                    service = {"id": uuid4().hex, "name": data["name"].strip()[:80], "url": url, "icon": "link-variant"}
                else:
                    raise HomeAssistantError("Choose a catalog service or enter a name and URL")
                if any(service["id"] == item["id"] or (
                    service.get("url") and item.get("url")
                    and public_url(service["url"]) == public_url(item["url"])
                ) for item in monitor.services.values()):
                    raise HomeAssistantError("This service is already tracked")
                monitor.add(service)
            else:
                service_id = data["service_id"]
                if service_id not in monitor.services:
                    raise HomeAssistantError("Service is no longer tracked")
                if call.service == "remove_service":
                    await monitor.remove(service_id)
                elif call.service == "set_tracking_paused":
                    service = monitor.services[service_id]
                    if not service.get("url"):
                        raise HomeAssistantError("This service only has a provider feed")
                    if bool(service.get("paused")) != data["paused"]:
                        service["paused"] = data["paused"]
                        service["run_start"] = time()
                        monitor.publish_state(service)
                else:
                    phone = data.get("phone")
                    if phone:
                        if not data["enabled"] or not phone.startswith("mobile_app_") or not hass.services.has_service("notify", phone):
                            raise HomeAssistantError("Choose a registered mobile app notification action")
                        if monitor.notify_action and monitor.notify_action != f"notify.{phone}":
                            raise HomeAssistantError("The notification destination has changed. Refresh the dashboard.")
                        monitor.notify_action = f"notify.{phone}"
                        entry = entries[0]
                        hass.config_entries.async_update_entry(entry, options={**entry.options, "notify_service": monitor.notify_action})
                    if data["enabled"] and not monitor.notify_action:
                        raise HomeAssistantError("Configure a notification action in Outage Map options first")
                    monitor.set_alerts(monitor.services[service_id], data["enabled"])
            monitor.save()

    readout_lock = asyncio.Lock()

    async def enable_readouts(call):
        entries = hass.config_entries.async_loaded_entries(DOMAIN)
        if not entries:
            raise HomeAssistantError("Set up Outage Map first")
        async with readout_lock:
            await async_enable_readouts(hass, call.data["provider"])

    async_register_admin_service(
        hass, DOMAIN, "enable_readouts", enable_readouts,
        vol.Schema({vol.Required("provider"): vol.In(SENSORS)}),
    )
    service_id = vol.Required("service_id")
    schemas = {
        "add_service": {vol.Optional(key): cv.string for key in ("catalog_id", "name", "url")},
        "remove_service": {service_id: cv.string},
        "set_tracking_paused": {service_id: cv.string, vol.Required("paused"): cv.boolean},
        "set_alerts": {service_id: cv.string, vol.Required("enabled"): cv.boolean, vol.Optional("phone"): cv.string},
    }
    for name, schema in schemas.items():
        async_register_admin_service(hass, DOMAIN, name, manage, vol.Schema(schema))
    return True

async def async_setup_entry(hass, entry):
    catalog = await hass.async_add_executor_job((WWW / "catalog.json").read_text)
    monitor = Monitor(hass, entry, json.loads(catalog))
    await monitor.load()
    entry.runtime_data = monitor
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    monitor.start()
    return True

async def async_unload_entry(hass, entry):
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        return False
    await entry.runtime_data.close()
    return True
