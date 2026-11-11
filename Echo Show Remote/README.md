# Echo Show Remote

A touch remote for the Office Apple TV on an Echo Show. It is an Alexa skill ("Office Remote"):
taps go from the skill to a Home Assistant webhook, which presses the button on the Apple TV.
Home Assistant opens the skill on the Echo Show when the Apple TV turns on.

| File | What it is |
|------|------------|
| `interaction-model.json` | The skill's voice model (invocation name "office remote") |
| `lambda/index.js` | The skill code; forwards taps to the Home Assistant webhook |
| `lambda/remote.json` | The on-screen remote (APL), scaled to fit any Echo Show |
| `lambda/package.json` | Dependencies for the Alexa-hosted skill |
| `automations.yaml` | The two Home Assistant automations, with a placeholder webhook ID |

Needs Home Assistant Cloud (Nabu Casa) for the webhook and Alexa Media Player for the automatic opening.

## Before you start

- **Alexa+ blocks this skill.** With Alexa+ on, the Echo Show answers "not supported on this device". It works with Alexa+ turned off.
- **The skill's language must match the Echo Show's.** A device set to English (Canada) cannot see a skill that only has English (US).
- **Choose Alexa-hosted (Node.js)** when creating the skill, or the Code tab will not work.
- Create the two automations from `automations.yaml` first, with your own webhook ID and entity IDs.

## 1. Get the webhook URL from Home Assistant

1. Open **Settings → Home Assistant Cloud → Webhooks**.
2. Turn on the webhook for **Office Remote: Echo Show commands**.
3. Copy the URL it shows. Treat it like a password.

## 2. Create the skill

1. Go to <https://developer.amazon.com/alexa/console/ask> and sign in with the **same Amazon
   account your Echo Show uses**.
2. **Create Skill**: name `Office Remote`, locale **English (CA)**, model **Custom**,
   hosting **Alexa-hosted (Node.js)**, template **Start from Scratch**.

## 3. Build tab

1. **Interfaces**: turn on **Alexa Presentation Language**, tick **every Hub profile**
   (the Echo Show 8 is Hub Landscape Medium), then **Save**.
2. **Interaction Model → JSON Editor**: replace everything with the contents of
   `interaction-model.json`, then **Save** and **Build skill**.

## 4. Code tab

1. Replace `index.js` with `lambda/index.js`.
2. Replace `package.json` with `lambda/package.json`.
3. Create a new file `remote.json` next to `index.js` and paste in `lambda/remote.json`.
4. In `index.js`, replace `PASTE_WEBHOOK_URL_HERE` with the URL from step 1.
5. **Save**, then **Deploy**.

## 5. Try it

1. **Test tab**: set "Skill testing is enabled in" to **Development**.
2. At the Echo Show, say **"Alexa, open office remote"**. The remote should appear.
3. Tap a button and check that the Apple TV responds.

## 6. Turn on the automatic opening

In Home Assistant, turn on the automation **Office Remote: show on Echo Show**. From then on the
remote opens when the Apple TV turns on and the Echo Show goes back to its home screen when the
Apple TV turns off.

## Changing things later

- **App buttons**: edit the `APPS` list at the top of `index.js`. Each `source` must match an app
  name Home Assistant lists for the Apple TV.
- **Revoking access**: change the `webhook_id` in the automation *Office Remote: Echo Show
  commands*, then repeat step 1 and paste the new URL into `index.js`.
