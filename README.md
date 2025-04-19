# Bytecrafter assistant - Local AI Chat with Docker

A local AI chat web application that uses Ollama models, with PDF processing, image OCR, and multiple conversations, all available in a cross-platform Docker implementation.

![LibreAI](resources/libreai-screenshot.png)

## 🌟 Key Features

- 💬 **Interactive Chat with Local AI**: No connection to external services for maximum privacy
- 📊 **Support for Multiple Models**: Compatible with any Ollama model (Mistral, Llama, Qwen, DeepSeek, etc.)
- 📷 **Image OCR**: Automatic text extraction from images with multilanguage support
- 📁 **Conversation Management**: Organize your chats in different sessions
- 📄 **Advanced PDF Processing**: Semantic analysis and content extraction
- 🌓 **Light/Dark Theme**: Adaptable interface to your preferences
- 🌎 **Multilanguage Support**: English and Spanish
- ✨ **Code Highlighting**: Enhanced visualization of code snippets
- 🧮 **Mathematical Formula Support**: Equation rendering
- 🔄 **Docker Implementation**: Easy installation and execution on any platform

## 🐳 Docker Installation

The application uses Docker to work consistently across all platforms. Follow these instructions to install it on your system.

### Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop/)
- [Docker Compose](https://docs.docker.com/compose/install/) (included in Docker Desktop for Windows and Mac)
- At least 8GB of available RAM
- Approximately 10GB of disk space (varies depending on the models you download)

### 🪟 Windows Installation

1. **Install Docker Desktop**:
   - Download [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)
   - Install WSL 2 if necessary (Windows 10/11):
     ```powershell
     wsl --install
     ```
   - Run the Docker Desktop installer and make sure the "Use WSL 2" option is selected
   - Restart your computer

2. **Clone/Download the Repository**:
   ```powershell
   git clone https://github.com/scharss/bytecrafterassistant.git
   cd bytecrafterassistant
   ```
   Or download and extract the repository ZIP

3. **Start the Containers**:
   ```powershell
   docker-compose up -d
   ```

4. **Download an AI Model**:
   ```powershell
   docker exec -it bytecrafterassistant-ollama-1 bash
   ollama pull qwen2.5-coder:7b
   exit
   ```

5. **Access the Application**:
   - Open a browser and go to http://localhost:5000

### 🍎 macOS Installation

1. **Install Docker Desktop**:
   - Download [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/)
   - Run the installer (make sure to select the correct version for your Mac: Intel or Apple Silicon)

2. **Clone/Download the Repository**:
   ```bash
   git clone https://github.com/scharss/bytecrafterassistant.git
   cd bytecrafterassistant
   ```
   Or download and extract the repository ZIP

3. **Start the Containers**:
   ```bash
   docker-compose up -d
   ```

4. **Download an AI Model**:
   ```bash
   docker exec -it bytecrafterassistant-ollama-1 bash
   ollama pull qwen2.5-coder:7b
   exit
   ```

5. **Access the Application**:
   - Open a browser and go to http://localhost:5000

### 🐧 Linux Installation

1. **Install Docker and Docker Compose**:
   - Ubuntu/Debian:
     ```bash
     sudo apt update
     sudo apt install docker.io docker-compose
     sudo systemctl enable --now docker
     ```
   - Fedora/RHEL/CentOS:
     ```bash
     sudo dnf install docker docker-compose
     sudo systemctl enable --now docker
     ```
   - Arch Linux:
     ```bash
     sudo pacman -S docker docker-compose
     sudo systemctl enable --now docker
     ```

2. **Add Your User to the Docker Group** (to use Docker without sudo):
   ```bash
   sudo usermod -aG docker $USER
   ```
   Log out and back in for the changes to take effect.

3. **Clone/Download the Repository**:
   ```bash
   git clone https://github.com/scharss/bytecrafterassistant.git
   cd bytecrafterassistant
   ```
   Or download and extract the repository ZIP

4. **Start the Containers**:
   ```bash
   docker-compose up -d
   ```

5. **Download an AI Model**:
   ```bash
   docker exec -it bytecrafterassistant-ollama-1 bash
   ollama pull qwen2.5-coder:7b
   exit
   ```

6. **Access the Application**:
   - Open a browser and go to http://localhost:5000

## 💡 Basic Usage

1. **Select a Model**:
   - Click on the configuration icon in the sidebar
   - Select a model from the list of available models

2. **Start a Conversation**:
   - Click on "New chat"
   - Type your message in the text field at the bottom
   - Press Enter or click the send icon

3. **Process PDFs**:
   - Click on the clip icon next to the text field
   - Select a PDF file
   - Wait for it to process and then ask questions about its content

4. **Process Images**:
   - Click on the camera icon next to the text field
   - Select an image
   - The application will extract text using OCR and you can ask questions about its content

## 🚀 Recommended Models

For balanced performance, we recommend these Ollama models:

- **Mistral 7B**: Good balance between performance and speed, ideal for getting started
- **DeepSeek Coder**: Excellent for programming-related tasks
- **Qwen2.5 Coder 7B**: Good performance in general tasks and programming
- **Llama2**: Powerful option for general conversation tasks

## ⚠️ Troubleshooting

### Cannot see Ollama models
- Make sure you have downloaded at least one model using `docker exec -it libreimagen-4-ollama-1 bash` and then `ollama pull mistral`
- Verify that both containers are running with `docker ps`
- Check the logs with `docker logs libreimagen-4-web-1`

### Web connection error
- Make sure no other service is using port 5000
- Check if the containers are running with `docker ps`
- Restart the containers: `docker-compose down` and then `docker-compose up -d`

### Problems with PDFs
- Make sure the PDF is not protected
- Verify that the PDF contains selectable text

### OCR Issues
- OCR works best with clear images and well-defined text
- Recognition may be limited with handwriting or unusual fonts

## 🔒 Privacy

All model inference is performed locally on your machine. No data is sent to external services, ensuring total privacy in your conversations.

## 📖 License

This project is licensed under the terms specified in the LICENSE file.

---

For more information or support, visit [the project repository](https://github.com/your-username/your-repository).


La aplicación estará disponible en `http://localhost:5000`. Puedes detener el contenedor con `Ctrl+C` en la terminal donde se está ejecutando o usando `docker-compose down`.
