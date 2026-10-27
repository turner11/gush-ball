# Getting an image API key

`generate.py` needs **one** of the two keys below. Gemini is used when both are set.

## Option A: Google Gemini (recommended)

Gemini is best at keeping a real person's face unchanged.

1. Open <https://aistudio.google.com/apikey> and sign in with a Google account.
2. Click **Create API key**, pick (or create) a Google Cloud project, and copy the key.
3. Image generation usually needs billing turned on. In AI Studio, click **Set up billing** next to the key and add a
   card. Without billing, the first run fails with a `429` or "quota" error; that's the cue.
4. Save the key for your Windows user. In PowerShell:

   ```powershell
   setx GEMINI_API_KEY "paste-the-key-here"
   ```

5. **Close and reopen** the terminal and Claude Code: `setx` only affects new processes.
6. To verify, run `echo $env:GEMINI_API_KEY` in a new PowerShell window. It should print the key.

## Option B: OpenAI

1. Open <https://platform.openai.com/api-keys> and click **Create new secret key**. Copy it, because it's shown once.
2. GPT image models may require **organization verification**. If the first run returns a `403` that mentions
   verification, open **Settings → Organization → General** and click **Verify Organization**.
3. Add credit under **Settings → Billing**.
4. Run `setx OPENAI_API_KEY "paste-the-key-here"`, then restart the terminal and Claude Code as in Option A.

## Choosing a model

The defaults are `gemini-nano-banana-2.1` and `gpt-image-2`. To try another model, set `POSTER_GEMINI_MODEL` or
`POSTER_OPENAI_MODEL`. For example, set `gemini-3-pro-image` (Nano Banana Pro) for the hardest edits, at a higher
price.

Rough cost: a few cents to about $0.20 per poster, depending on the model and quality.
