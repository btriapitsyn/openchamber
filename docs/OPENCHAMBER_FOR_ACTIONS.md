# 🚀 OpenChamber for Actions

**Version:**  `v0.1.0-preview`

**OpenChamber for Actions** allows you to run a full OpenChamber environment remotely for several hours without needing a local computer. This update streamlines the experience by integrating **OpenCode** access and implementing session persistence so you don't have to log in repeatedly.

---

## 🌟 Key Features

* **Zero-Hardware Requirement:** Run high-performance AI environments entirely on GitHub's infrastructure.
* **OpenCode Integration:** Full access to the OpenCode AI suite and "Antigravity" model selection (including Gemini 3 and Claude 4.5).
* **Persistent Sessions:** Your login state, OAuth tokens, and configurations are saved as [GitHub Artifacts](https://docs.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts). Once you log in once, subsequent runs will restore your session automatically.
* **Self-Healing Tunnels:** Features automated background monitoring to keep your connection stable.

---

## 📖 New to this? (Beginners' Guide)

<details>
<summary><b>Click to expand: What is this and how does it help me?</b></summary>

### 1. What exactly is this?
Think of this as a "Computer in the Cloud." Instead of making your own laptop hot and slow by running complex AI coding environments, we use **GitHub Actions** (powerful remote servers provided by GitHub) to do the heavy lifting for you.

### 2. What do I need to start?
* A **[GitHub Account](https://github.com/join)** (Free).
* A web browser (Chrome, Edge, Safari, etc.).
* That's it! No powerful graphics card or expensive PC required.

### 3. Why is "Cloudflare" recommended?
We use [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) because it creates a secure web link to your remote environment **automatically**. You don't need to sign up for accounts or copy-paste complicated API keys. It is the "click and play" option.

### 4. What is "Persistence"?
Usually, when you close a cloud computer, everything is deleted. **Persistence** changes that. When your session ends, we save your "save game" (login info and settings) into a secure file called an **Artifact**. The next time you run the tool, it loads that file so you don't have to log in again.
</details>

---

## ⚠️ Usage Limits & Quotas

To ensure stability and compliance with [GitHub’s Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service), please be aware of the following limits:

| Limit Type | Constraint | Explanation |
| :--- | :--- | :--- |
| **Time Limit** | **6 Hours Max** | GitHub automatically kills any process after 360 minutes (6 hours). |
| **Storage** | **2GB** | The saved session data (Artifacts) cannot exceed 2GB per repository. |
| **Concurrency** | **1 Run Only** | You should only run one OpenChamber instance at a time to prevent errors. |
| **Hardware** | **2-Core CPU** | The environment runs on standard Linux runners (~7GB RAM). |

---

## 🛠 Installation Guide

### Option A: The "Easy Mode" (Recommended)
*Uses Cloudflare Tunnels. No configuration required.*

1.  **[Fork this repository](https://docs.github.com/en/get-started/quickstart/fork-a-repo)** to your own GitHub account (Click the "Fork" button at the top right of this page).
2.  Go to the **Actions** tab in your new forked repository.
3.  Select the **OpenChamber for Actions** workflow on the left sidebar.
4.  Click the **Run workflow** dropdown button.
    *   **Tunnel Provider:** Choose `cloudflare` (default) or `ngrok`.
    *   **Auto-shutdown after (minutes):** Set the duration (default `300` minutes).
5.  Hit the green **Run workflow** button.
6.  **Wait ~30 seconds** for the setup to initialize.
7.  Click on the active workflow run, then click on the **serve** job.
8.  Expand the step named **"Monitor & Self-Heal"**. You will see the URL(s) for your environment (e.g., `https://funny-name-random-words.trycloudflare.com`). Click it to access your environment!

---

### Option B: The "Pro Mode" (Using Ngrok)

<details>
<summary><b>Click to expand: Step-by-step guide for setting up Ngrok</b></summary>

If you prefer using [Ngrok](https://ngrok.com/) for a static domain or personal preference, follow these steps to set up your API key.

#### Step 1: Get your Authtoken
1.  Log in or Sign up for a free account at **[dashboard.ngrok.com](https://dashboard.ngrok.com/signup)**.
2.  On the left sidebar, click **"Your Authtoken"**.
3.  Click the **Copy** button to copy your token string (it looks like `21xYz...`).

#### Step 2: Add Secret to GitHub
1.  Go to your forked repository on GitHub.
2.  Click on **Settings** (top right tab).
3.  On the left sidebar, scroll down to **Secrets and variables** and click **Actions**.
4.  Click the green button **New repository secret**.
5.  **Name:** `NGROK_AUTH_TOKEN` (Must be exactly this!).
6.  **Secret:** Paste the token you copied from Ngrok.
7.  Click **Add secret**.

#### Step 3: Run with Ngrok
1.  Go to the **Actions** tab.
2.  Select **OpenChamber for Actions**.
3.  Click **Run workflow**.
4.  Select `ngrok` as the **Tunnel Provider**.
5.  Find your URL in the **"Monitor & Self-Heal"** log step. It will look like `https://xxxx-xx-xx-xx.ngrok-free.app`.
</details>

---

## ❓ Frequently Asked Questions (FAQ)

<details>
<summary><b>Q: Is this completely free?</b></summary>
Yes! GitHub provides 2,000 minutes of free for private repositories (unlimited minutes for public repositories). Since this runs on GitHub Actions, it consumes those minutes.
</details>

<details>
<summary><b>Q: Why did my session stop working after a few hours?</b></summary>
This is normal. GitHub Actions has a hard limit of 6 hours per job. The environment will automatically shut down. However, thanks to **Persistence**, your data is saved! Just run the workflow again to pick up where you left off.
</details>

<details>
<summary><b>Q: Can I use this on my phone or tablet?</b></summary>
Absolutely. Once you get the public URL (Cloudflare or Ngrok), you can open it in any mobile browser (Chrome on Android, Safari on iPad) and code on the go.
</details>

<details>
<summary><b>Q: Is my data private?</b></summary>
If you fork this as a **Public** repository, your code might be visible to others depending on how you save it. For maximum privacy, we recommend forking this as a **Private** repository (GitHub allows free Actions on private repos too, but the minute allowance is lower for free accounts).
</details>

<details>
<summary><b>Q: I see a "Connection Refused" error. What do I do?</b></summary>
This usually happens if the server hasn't finished starting up yet. Wait 30 seconds and refresh the page. If it persists, check the "Monitor" logs in the Actions tab to see if the tunnel crashed.
</details>

---

## ⚙️ Technical Specifications

| Feature | Detail |
| :--- | :--- |
| **Version** | `v0.1.0-preview` |
| **OS** | Ubuntu 22.04 LTS (GitHub Runner) |
| **Node Version** | v20.x |
| **Tunnel Protocols** | `cloudflared` (Argon) / `ngrok` (HTTP) |
| **Artifact Retention** | 90 Days (Default GitHub Policy) |

> [!NOTE]
> This project is for educational and development purposes. Do not use this workflow for mining crypto or other activities banned by the [GitHub Acceptable Use Policy](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies).
