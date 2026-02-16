
# CET-4/6 Adaptive Writing Coach (大学英语四六级写作智能教练)

A specialized, AI-powered writing assistant designed for students preparing for CET-4/6 exams. Unlike generic AI wrappers, this tool focuses on **scaffolding (支架式教学)**, **Socratic questioning (苏格拉底提问)**, and **contrastive learning (对比教学)**.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Tech](https://img.shields.io/badge/Tech-React%20%7C%20TypeScript%20%7C%20Gemini%20API-green)

## ✨ Key Features

1.  **Socratic Inspiration (思维训练)**
    *   "Forced Association" mode: Generates 3 random, challenging perspectives for any topic to train critical thinking.
    *   Provides language scaffolds (vocabulary, collocations, sentence frames) *after* the student brainstorms.

2.  **Professor-Grade Assessment (作文批改)**
    *   **Senior Professor Persona**: Encouraging yet rigorous feedback tailored to CET-4/6 standards.
    *   **Color-Coded Diagnostics**: Critical (Red), General (Yellow), and Minor (Green) issue categorization.
    *   **Contrastive Learning**: Side-by-side comparison between student sentences and C1-level polished versions.

3.  **Adaptive Sentence Drills (句子特训)**
    *   **Grammar Doctor**: Fix specific errors derived from your own writing history.
    *   **Elevation Lab**: Practice upgrading simple vocabulary to academic equivalents.
    *   **Structure Architect**: Train logic and complex sentence structures.

## 🚀 Getting Started

### Prerequisites

*   Node.js (v16 or higher)
*   A Google Gemini API Key (Free tier available) OR an OpenAI-compatible API Key.

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/cet-writing-coach.git
    cd cet-writing-coach
    ```

2.  Install dependencies:
    ```bash
    npm install
    # or
    yarn install
    ```

3.  Start the development server:
    ```bash
    npm start
    ```

## 🔑 API Key Configuration (Important)

This application follows a **Bring Your Own Key (BYOK)** architecture to ensure privacy and security. **Your API key is never stored on our servers.**

### Option 1: UI Configuration (Recommended)
1.  Open the app in your browser.
2.  Click the **Settings (⚙️)** icon in the top right corner.
3.  Select **Google Gemini** (or your preferred provider).
4.  Paste your API Key.
5.  Click Save. The key is stored locally in your browser's `localStorage`.

### Option 2: Environment Variable (For Development)
Create a `.env` file in the root directory:

```env
# Google Gemini API Key
API_KEY=AIzaSy...
```

*Note: The `.env` file is git-ignored by default to prevent accidental leakage.*

## 🛡️ Privacy & Security

*   **Local Storage**: Chat history and API keys are stored entirely in your browser's `localStorage`.
*   **Direct API Calls**: The app communicates directly from your browser to the AI Provider (Google/OpenAI). No intermediate backend server reads your data.

## 🛠️ Tech Stack

*   **Frontend**: React 18, TypeScript, Tailwind CSS
*   **AI Integration**: Google GenAI SDK (`@google/genai`)
*   **Build Tool**: Webpack / CRA

## 📄 License

This project is licensed under the MIT License.
