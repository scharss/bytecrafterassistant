let chats = [];
        let currentChatId = null;
        let messageHistory = {};
        let currentPdfFile = null;  // Variable para almacenar el nombre del PDF actual
        let currentChunkIndex = 0;  // Índice del fragmento actual
        let totalChunks = 0;  // Total de fragmentos disponibles
        let pdfChats = new Set();  // Conjunto para rastrear chats que usan PDF
        let currentController = null;
        let isGenerating = false; // Variable para controlar si estamos generando una respuesta

        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            const mainContent = document.getElementById('mainContent');
            
            if (window.innerWidth <= 768) {
                // En móviles, usamos expanded/collapsed para el sidebar
                sidebar.classList.toggle('expanded');
            } else {
                // En desktop, usamos collapsed para el sidebar
                sidebar.classList.toggle('collapsed');
            }
            
            // Siempre toggle la clase expanded del contenido principal
            mainContent.classList.toggle('expanded');
        }

        // Agregar listener para manejar cambios de tamaño de ventana
        window.addEventListener('resize', function() {
            const sidebar = document.getElementById('sidebar');
            const mainContent = document.getElementById('mainContent');
            
            if (window.innerWidth <= 768) {
                // En móviles, remover collapsed y usar expanded
                sidebar.classList.remove('collapsed');
                if (!sidebar.classList.contains('expanded')) {
                    mainContent.classList.add('expanded');
                }
            } else {
                // En desktop, remover expanded y usar collapsed
                sidebar.classList.remove('expanded');
                if (!sidebar.classList.contains('collapsed')) {
                    mainContent.classList.remove('expanded');
                }
            }
        });

        function createNewChat() {
            const chatId = Date.now().toString();
            const savedLanguage = localStorage.getItem('selectedLanguage') || 'en';
            const t = translations[savedLanguage];
            
            const chat = {
                id: chatId,
                title: t.newChat,
                messages: []
            };
            
            if (chats.length === 0) {
                const historyContainer = document.getElementById('chat-history');
                historyContainer.innerHTML = '';
            }
            
            chats.unshift(chat);
            currentChatId = chatId;
            messageHistory[chatId] = [];
            
            // Resetear estado del PDF para el nuevo chat
            if (!pdfChats.has(chatId)) {
                currentPdfFile = null;
                currentChunkIndex = 0;
                totalChunks = 0;
                updatePdfInfo();
            }
            
            updateChatHistory();
            clearChat();
        }

        function updateChatHistory() {
            const historyContainer = document.getElementById('chat-history');
            // Limpiar el contenedor antes de agregar los elementos
            historyContainer.innerHTML = '';
            
            chats.forEach(chat => {
                const chatElement = document.createElement('div');
                chatElement.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
                chatElement.innerHTML = `
                    <span class="title">${chat.title}</span>
                    <button class="delete-btn" onclick="deleteChat('${chat.id}')">Eliminar</button>
                `;
                chatElement.onclick = () => loadChat(chat.id);
                historyContainer.appendChild(chatElement);
            });
        }

        function loadChat(chatId) {
            if (currentChatId === chatId) return;
            
            currentChatId = chatId;
            
            // Restaurar estado del PDF si el chat lo usaba
            if (pdfChats.has(chatId)) {
                const chatMessages = messageHistory[chatId] || [];
                const pdfMessage = chatMessages.find(msg => msg.pdfFile);
                if (pdfMessage) {
                    currentPdfFile = pdfMessage.pdfFile;
                    currentChunkIndex = pdfMessage.chunkIndex || 0;
                    totalChunks = pdfMessage.totalChunks || 0;
                } else {
                    currentPdfFile = null;
                    currentChunkIndex = 0;
                    totalChunks = 0;
                }
            } else {
                currentPdfFile = null;
                currentChunkIndex = 0;
                totalChunks = 0;
            }
            
            updatePdfInfo();
            updateChatHistory();
            
            // Limpiar el contenedor antes de mostrar los mensajes
            const container = document.getElementById('chat-container');
            container.innerHTML = '';
            
            // Obtener los mensajes únicos del historial
            const messages = messageHistory[chatId] || [];
            const uniqueMessages = Array.from(new Map(
                messages.map(msg => [msg.timestamp + msg.content, msg])
            ).values());
            
            // Mostrar los mensajes ordenados
            uniqueMessages
                .sort((a, b) => a.timestamp - b.timestamp)
                .forEach(msg => appendMessageToUI(msg.content, msg.isUser));
            
            // Limpiar y enfocar el input
            const textarea = document.getElementById('message-input');
            textarea.value = '';
            textarea.focus();
            autoResize(textarea);
        }

        function clearChat() {
            const container = document.getElementById('chat-container');
            container.innerHTML = '';
        }

        function displayMessages(messages) {
            if (!messages || messages.length === 0) return;
            
            const container = document.getElementById('chat-container');
            container.innerHTML = '';
            
            messages
                .sort((a, b) => a.timestamp - b.timestamp)
                .forEach(msg => appendMessageToUI(msg.content, msg.isUser));
        }

        function deleteChat(chatId) {
            event.stopPropagation(); // Evitar que se active el onclick del chat-item
            const chat = chats.find(c => c.id === chatId);
            if (!confirm(`¿Estás seguro de que deseas eliminar el chat "${chat.title}"?`)) {
                return;
            }
            
            // Eliminar el chat del array y su historial
            chats = chats.filter(c => c.id !== chatId);
            delete messageHistory[chatId];
            
            // Si el chat eliminado era el actual, cargar otro chat o crear uno nuevo
            if (currentChatId === chatId) {
                if (chats.length > 0) {
                    loadChat(chats[0].id);
                } else {
                    createNewChat();
                }
            } else {
                updateChatHistory();
            }
        }

        function showCopyNotification(messageElement) {
            // Mostrar notificación de copiado
            const notification = document.createElement('div');
            notification.textContent = '¡Copiado!';
            notification.style.position = 'absolute';
            notification.style.top = '8px';
            notification.style.right = '40px';
            notification.style.backgroundColor = 'rgba(52, 53, 65, 0.9)';
            notification.style.color = '#ECECF1';
            notification.style.padding = '4px 8px';
            notification.style.borderRadius = '4px';
            notification.style.fontSize = '12px';
            notification.style.zIndex = '1000';
            
            messageElement.appendChild(notification);
            
            setTimeout(() => {
                notification.remove();
            }, 2000);
        }

        function appendMessageToUI(message, isUser = false) {
            const container = document.getElementById('chat-container');
            const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
            
            const messageGroup = document.createElement('div');
            messageGroup.className = 'message-group';
            
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${isUser ? 'user-message' : 'assistant-message'}`;
            messageDiv.setAttribute('data-user', isUser ? 'true' : 'false');
            
            // Crear el contenedor para el mensaje y su contenido
            const senderDiv = document.createElement('div');
            senderDiv.className = 'font-medium';
            senderDiv.textContent = isUser ? 'Usuario' : 'Asistente';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.innerHTML = message;
            
            // Añadir elementos al DOM
            messageDiv.appendChild(senderDiv);
            messageDiv.appendChild(contentDiv);
            
            // Si es un mensaje del asistente, agregar el botón de copiar
            if (!isUser) {
                const copyButton = document.createElement('button');
                copyButton.className = 'copy-button';
                copyButton.innerHTML = '📋';
                copyButton.title = 'Copiar al portapapeles';
                
                // Asignar manejador de eventos directamente con función anónima
                copyButton.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const text = contentDiv.innerText || contentDiv.textContent;
                    copyTextToClipboard(text, messageDiv);
                });
                
                messageDiv.appendChild(copyButton);
            }
            
            messageGroup.appendChild(messageDiv);
            container.appendChild(messageGroup);

            if (isUser || isNearBottom) {
                container.scrollTop = container.scrollHeight;
            }

            if (!isUser) {
                renderMath();
                hljs.highlightAll();
            }

            if (currentChatId) {
                if (!messageHistory[currentChatId]) {
                    messageHistory[currentChatId] = [];
                }
                
                const messageExists = messageHistory[currentChatId].some(msg => 
                    msg.content === message && msg.isUser === isUser
                );
                
                if (!messageExists) {
                    messageHistory[currentChatId].push({
                        content: message,
                        isUser: isUser,
                        timestamp: Date.now()
                    });
                }

                if (isUser) {
                    const chat = chats.find(c => c.id === currentChatId);
                    const savedLanguage = localStorage.getItem('selectedLanguage') || 'en';
                    const t = translations[savedLanguage];
                    if (chat && chat.title === t.newChat) {
                        const firstLine = message.split('\n')[0];
                        chat.title = firstLine;
                        updateChatHistory();
                    }
                }
            }
        }

        // Función simplificada para copiar al portapapeles
        function copyTextToClipboard(text, parentElement) {
            console.log("Copiando texto:", text.substring(0, 50) + "...");
            
            if (!text) {
                console.error("No hay texto para copiar");
                return;
            }
            
            // Usar API moderna del portapapeles si está disponible
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text)
                    .then(() => {
                        showCopyNotification(parentElement);
                    })
                    .catch(err => {
                        console.error("Error al copiar con API moderna:", err);
                        copyWithFallback(text, parentElement);
                    });
            } else {
                copyWithFallback(text, parentElement);
            }
        }
        
        // Método alternativo para copiar
        function copyWithFallback(text, parentElement) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            
            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    showCopyNotification(parentElement);
                } else {
                    console.error("Comando copy falló silenciosamente");
                }
            } catch (err) {
                console.error("Error en execCommand:", err);
            }
            
            document.body.removeChild(textarea);
        }

        const chatContainer = document.getElementById('chat-container');
        const userInput = document.getElementById('message-input');
        const sendButton = document.getElementById('send-button');

        // Configuración de marked para el renderizado de markdown
        marked.setOptions({
            highlight: function(code, language) {
                if (language && hljs.getLanguage(language)) {
                    return hljs.highlight(code, { language: language }).value;
                }
                return hljs.highlightAuto(code).value;
            },
            breaks: true
        });

        function adjustTextareaHeight() {
            userInput.style.height = 'auto';
            userInput.style.height = Math.min(userInput.scrollHeight, 200) + 'px';
        }

        userInput.addEventListener('input', function() {
            adjustTextareaHeight();
            sendButton.disabled = !userInput.value.trim();
        });

        function handleKeyDown(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (!sendButton.disabled) {
                    sendMessage();
                }
            }
        }

        function toggleSendButton(generating) {
            const sendButton = document.getElementById('send-button');
            isGenerating = generating;

            if (generating) {
                // Cambiar a botón de stop
                sendButton.innerHTML = `
                    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" 
                         stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
                        <rect x="6" y="6" width="12" height="12"></rect>
                    </svg>
                `;
                sendButton.title = "Detener generación";
                sendButton.classList.add('stop-button');
                sendButton.disabled = false;
            } else {
                // Restaurar botón de enviar
                sendButton.innerHTML = `
                    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" 
                         stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 rotate-90">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                `;
                sendButton.title = "Enviar mensaje";
                sendButton.classList.remove('stop-button');
                // Solo habilitar si hay texto
                sendButton.disabled = !userInput.value.trim();
            }
        }

        // Agregar el event listener para el botón de envío
        sendButton.addEventListener('click', function() {
            if (isGenerating) {
                // Si está generando, cancelar la respuesta
                stopGeneration();
            } else if (!sendButton.disabled) {
                // Si no está generando y está habilitado, enviar mensaje
                sendMessage();
            }
        });

        function stopGeneration() {
            if (currentController) {
                currentController.abort();
                currentController = null;
                toggleSendButton(false);
                appendMessageToUI("_La generación fue detenida por el usuario._", false);
            }
        }

        function createMessageElement(content, isUser = false) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${isUser ? 'user-message' : 'assistant-message'}`;
            
            if (isUser) {
                messageDiv.innerHTML = `
                    <div class="font-medium">Usuario</div>
                    <div class="message-content">${marked.parse(content)}</div>
                `;
            } else {
                messageDiv.innerHTML = `
                    <div class="font-medium">Asistente</div>
                    <div class="message-content">${content}</div>
                `;
            }
            
            return messageDiv;
        }

        function createCodeBlock(code, language = '') {
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block';
            
            const header = document.createElement('div');
            header.className = 'code-header';
            
            const languageSpan = document.createElement('span');
            languageSpan.textContent = language || 'plaintext';
            
            const actions = document.createElement('div');
            actions.className = 'code-actions';
            
            const copyButton = document.createElement('button');
            copyButton.className = 'code-button';
            copyButton.innerHTML = 'Copiar';
            copyButton.onclick = () => copyCode(code, copyButton);
            
            const downloadButton = document.createElement('button');
            downloadButton.className = 'code-button';
            downloadButton.innerHTML = 'Descargar';
            downloadButton.onclick = () => downloadCode(code, language);
            
            actions.appendChild(copyButton);
            actions.appendChild(downloadButton);
            
            header.appendChild(languageSpan);
            header.appendChild(actions);
            
            const pre = document.createElement('pre');
            pre.className = 'code-content';
            const codeElement = document.createElement('code');
            codeElement.className = language ? `language-${language}` : '';
            codeElement.textContent = code;
            
            pre.appendChild(codeElement);
            wrapper.appendChild(header);
            wrapper.appendChild(pre);
            
            hljs.highlightElement(codeElement);
            return wrapper;
        }

        function copyCode(code, button) {
            navigator.clipboard.writeText(code).then(() => {
                const notification = document.createElement('div');
                notification.className = 'copy-notification';
                notification.textContent = '¡Copiado!';
                button.parentElement.appendChild(notification);
                
                setTimeout(() => {
                    notification.classList.add('show');
                }, 100);
                
                setTimeout(() => {
                    notification.classList.remove('show');
                    setTimeout(() => notification.remove(), 200);
                }, 2000);
            });
        }

        function downloadCode(code, language) {
            const blob = new Blob([code], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `code.${language || 'txt'}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }

        function processMarkdownAndCode(content) {
            // Primero procesamos los bloques de código
            content = content.replace(/```(\w*)\n([\s\S]*?)```/g, (match, language, code) => {
                const codeBlock = createCodeBlock(code.trim(), language);
                return `<div class="code-block-placeholder" data-code="${encodeURIComponent(code.trim())}" data-language="${language}"></div>`;
            });

            // Luego procesamos el markdown
            content = marked.parse(content);

            // Finalmente reemplazamos los placeholders con los bloques de código reales
            content = content.replace(/<div class="code-block-placeholder" data-code="([^"]*)" data-language="([^"]*)">/g, 
                (match, code, language) => {
                    return createCodeBlock(decodeURIComponent(code), language).outerHTML;
                });

            return content;
        }

        async function renderMath() {
            try {
                await renderMathInElement(document.body, {
                    delimiters: [
                        {left: "$$", right: "$$", display: true},
                        {left: "$", right: "$", display: false},
                        {left: "\\[", right: "\\]", display: true},
                        {left: "\\(", right: "\\)", display: false}
                    ],
                    throwOnError: false,
                    output: 'html',
                    strict: false
                });
            } catch (error) {
                console.error('Error rendering math:', error);
            }
        }

        function autoResize(textarea) {
            textarea.style.height = '24px';
            textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
            
            // Ajustar el padding del contenedor cuando el textarea crece
            const inputBox = textarea.closest('.input-box');
            if (inputBox) {
                const textareaHeight = parseInt(textarea.style.height);
                const buttonHeight = 28; // altura del botón de envío
                const buttonBottom = 12; // espacio desde el botón hasta el borde inferior
                const totalPadding = Math.max(12, (textareaHeight - buttonHeight) / 2 + buttonBottom);
                inputBox.style.paddingBottom = totalPadding + 'px';
            }
            
            // Habilitar/deshabilitar el botón de envío
            document.getElementById('send-button').disabled = !textarea.value.trim();
        }

        function updatePdfInfo() {
            const pdfInfo = document.getElementById('pdf-info');
            const status = pdfInfo.querySelector('.pdf-status');
            const indicator = pdfInfo.querySelector('.chunk-indicator');
            const context = pdfInfo.querySelector('.chunk-context');
            const prevBtn = pdfInfo.querySelector('.chunk-nav-btn:first-of-type');
            const nextBtn = pdfInfo.querySelector('.chunk-nav-btn:last-of-type');

            if (currentPdfFile && totalChunks > 0) {
                pdfInfo.style.display = 'block';
                status.textContent = `PDF activo: ${currentPdfFile}`;
                indicator.textContent = `Fragmento ${currentChunkIndex + 1} de ${totalChunks}`;
                
                // Actualizar el contexto
                let contextText = 'Analizando fragmentos: ';
                if (currentChunkIndex > 0) {
                    contextText += `${currentChunkIndex}, `;
                }
                contextText += `${currentChunkIndex + 1}`;
                if (currentChunkIndex < totalChunks - 1) {
                    contextText += `, ${currentChunkIndex + 2}`;
                }
                context.textContent = contextText;
                
                prevBtn.disabled = currentChunkIndex === 0;
                nextBtn.disabled = currentChunkIndex >= totalChunks - 1;
            } else {
                pdfInfo.style.display = 'none';
            }
        }

        function prevChunk() {
            if (currentChunkIndex > 0) {
                currentChunkIndex--;
                updatePdfInfo();
            }
        }

        function nextChunk() {
            if (currentChunkIndex < totalChunks - 1) {
                currentChunkIndex++;
                updatePdfInfo();
            }
        }

        function appendThinkingMessage(message) {
            const container = document.getElementById('chat-container');
            let thinkingDiv = document.getElementById('thinking-message');
            
            // Obtener el idioma actual y las traducciones
            const currentLang = localStorage.getItem('selectedLanguage') || 'en';
            const t = translations[currentLang];
            
            // Verificar si el usuario está cerca del final antes de actualizar
            const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
            
            // Seleccionar un mensaje aleatorio de thinking en el idioma correcto
            const randomThinkingMessage = t.thinking[Math.floor(Math.random() * t.thinking.length)];
            
            if (!thinkingDiv) {
                thinkingDiv = document.createElement('div');
                thinkingDiv.id = 'thinking-message';
                thinkingDiv.className = 'message assistant-message thinking';
                container.appendChild(thinkingDiv);
            }
            
            thinkingDiv.textContent = randomThinkingMessage;
            
            // Solo hacer scroll si el usuario estaba cerca del final
            if (isNearBottom) {
                container.scrollTop = container.scrollHeight;
            }
        }

        function sendMessage() {
            const input = document.getElementById('message-input');
            const message = input.value.trim();
            
            if (!message) return;
            
            // Crear un nuevo chat si no hay uno activo
            if (!currentChatId) {
                createNewChat();
            }

            // Obtener el modelo seleccionado
            const selectedModel = localStorage.getItem('selectedModel') || 'deepseek-r1:7b';

            // Obtener el historial de mensajes para este chat
            const chatHistory = messageHistory[currentChatId] || [];
            
            // Mostrar el mensaje del usuario
            appendMessageToUI(message, true);
            
            // Limpiar y reajustar el input
            input.value = '';
            input.style.height = 'auto';
            
            // Cambiar botón a modo "detener"
            toggleSendButton(true);

            // Guardar la posición actual del scroll antes de enviar el mensaje
            const container = document.getElementById('chat-container');
            const wasNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

            // Crear un AbortController para poder cancelar la solicitud
            currentController = new AbortController();
            const signal = currentController.signal;

            // Enviar mensaje al servidor
            fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    message: message,
                    model: selectedModel,
                    pdf_file: currentPdfFile,
                    chunk_index: currentChunkIndex,
                    isPdfChat: pdfChats.has(currentChatId),
                    chat_id: currentChatId,
                    history: chatHistory  // Agregar el historial de mensajes
                }),
                signal: signal
            })
            .then(response => {
                const reader = response.body.getReader();
                let decoder = new TextDecoder();
                let buffer = '';

                function processStream({ done, value }) {
                    if (done) {
                        toggleSendButton(false);
                        return;
                    }

                    buffer += decoder.decode(value, { stream: true });
                    let lines = buffer.split('\n');
                    buffer = lines.pop();

                    lines.forEach(line => {
                        if (line) {
                            try {
                                const data = JSON.parse(line);
                                
                                if (data.thinking) {
                                    // Mostrar mensaje de "pensando"
                                    appendThinkingMessage(data.thinking);
                                } else if (data.clear_thinking) {
                                    // Limpiar mensaje de "pensando"
                                    clearThinkingMessage();
                                } else if (data.response) {
                                    // Actualizar la respuesta del asistente
                                    updateOrAppendAssistantMessage(data.response, wasNearBottom);
                                } else if (data.error) {
                                    // Mostrar mensaje de error
                                    appendMessageToUI(data.error);
                                    toggleSendButton(false);
                                }
                            } catch (e) {
                                console.error('Error parsing JSON:', e);
                            }
                        }
                    });

                    return reader.read().then(processStream);
                }

                return reader.read().then(processStream);
            })
            .catch(error => {
                if (error.name === 'AbortError') {
                    console.log('Solicitud cancelada por el usuario');
                } else {
                    console.error('Error:', error);
                    appendMessageToUI('Error de conexión: ' + error.message, false);
                }
                toggleSendButton(false);
            });
        }

        function clearThinkingMessage() {
            const thinkingDiv = document.getElementById('thinking-message');
            if (thinkingDiv) {
                thinkingDiv.remove();
            }
        }

        function updateOrAppendAssistantMessage(message, wasNearBottom) {
            const container = document.getElementById('chat-container');
            const lastGroup = container.lastElementChild;
            
            if (lastGroup && lastGroup.classList.contains('message-group')) {
                const lastMessage = lastGroup.lastElementChild;
                
                if (lastMessage && lastMessage.classList.contains('assistant-message')) {
                    // Actualizar el último mensaje - primero eliminar el botón de copiar
                    const copyButton = lastMessage.querySelector('.copy-button');
                    if (copyButton) {
                        copyButton.remove();
                    }
                    
                    // Actualizar el contenido del mensaje
                    const contentDiv = lastMessage.querySelector('.message-content');
                    if (contentDiv) {
                        contentDiv.innerHTML = message;
                    } else {
                        // Si no existe el div de contenido, reconstruir la estructura correctamente
                        lastMessage.innerHTML = '';
                        
                        const senderDiv = document.createElement('div');
                        senderDiv.className = 'font-medium';
                        senderDiv.textContent = 'Asistente';
                        
                        const newContentDiv = document.createElement('div');
                        newContentDiv.className = 'message-content';
                        newContentDiv.innerHTML = message;
                        
                        lastMessage.appendChild(senderDiv);
                        lastMessage.appendChild(newContentDiv);
                    }
                    
                    // Recrear botón de copiar
                    const newCopyButton = document.createElement('button');
                    newCopyButton.className = 'copy-button';
                    newCopyButton.innerHTML = '📋';
                    newCopyButton.title = 'Copiar al portapapeles';
                    
                    // Asignar manejador de eventos
                    newCopyButton.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        const text = lastMessage.querySelector('.message-content').innerText || 
                                    lastMessage.querySelector('.message-content').textContent;
                        copyTextToClipboard(text, lastMessage);
                    });
                    
                    lastMessage.appendChild(newCopyButton);
                    
                    // Renderizar matemáticas y código después de actualizar el mensaje
                    renderMath();
                    hljs.highlightAll();
                    
                    // Actualizar el último mensaje en el historial
                    if (currentChatId && messageHistory[currentChatId]) {
                        const lastHistoryMessage = messageHistory[currentChatId].findLast(msg => !msg.isUser);
                        if (lastHistoryMessage) {
                            lastHistoryMessage.content = message;
                        } else {
                            messageHistory[currentChatId].push({
                                content: message,
                                isUser: false,
                                timestamp: Date.now()
                            });
                        }
                    }
                } else {
                    // Agregar nuevo mensaje al grupo existente
                    appendMessageToUI(message, false);
                }
            } else {
                // Crear nuevo grupo y agregar mensaje
                appendMessageToUI(message, false);
            }
        }

        // Inicializar el chat y configurar los event listeners
        document.addEventListener('DOMContentLoaded', () => {
            createNewChat();
            
            // Cargar y mostrar el modelo seleccionado
            const selectedModel = localStorage.getItem('selectedModel');
            updateCurrentModelDisplay(selectedModel);
            
            const textarea = document.getElementById('message-input');
            
            // Manejar envío con Enter (Shift+Enter para nueva línea)
            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!textarea.value.trim()) return;
                    sendMessage();
                }
            });

            // Asegurar que el textarea tenga la altura correcta al inicio
            autoResize(textarea);
            
            // Enfocar el textarea al cargar
            textarea.focus();
        });

        // Funciones de configuración
        function openConfig() {
            document.getElementById('configModal').classList.add('show');
            loadAvailableModels();
        }

        function closeConfig() {
            document.getElementById('configModal').classList.remove('show');
        }

        async function loadAvailableModels() {
            try {
                const response = await fetch('http://localhost:11434/api/tags');
                const data = await response.json();
                const modelList = document.getElementById('modelList');
                modelList.innerHTML = '';
                
                // Get current language
                const currentLang = localStorage.getItem('selectedLanguage') || 'en';
                const t = translations[currentLang];

                // Si hay modelos disponibles y ninguno está seleccionado, seleccionar el primero
                if (data.models.length > 0 && !localStorage.getItem('selectedModel')) {
                    selectModel(data.models[0].name, true);
                }

                data.models.forEach(model => {
                    const modelElement = document.createElement('div');
                    modelElement.className = 'model-item';
                    modelElement.innerHTML = `
                        <div class="model-info">
                            <span class="model-name">${model.name}</span>
                            <span class="model-details">${t.size}: ${formatSize(model.size)}</span>
                        </div>
                        <button class="model-select" onclick="selectModel('${model.name}')">${t.select}</button>
                    `;
                    modelList.appendChild(modelElement);
                });
            } catch (error) {
                console.error('Error loading models:', error);
                const modelList = document.getElementById('modelList');
                modelList.innerHTML = '<p style="color: #ff4444;">Error loading models. Make sure Ollama is running.</p>';
            }
        }

        function formatSize(bytes) {
            const sizes = ['B', 'KB', 'MB', 'GB'];
            if (bytes === 0) return '0 B';
            const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
            return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
        }

        function selectModel(modelName, isInitialLoad = false) {
            localStorage.setItem('selectedModel', modelName);
            const savedLanguage = localStorage.getItem('selectedLanguage') || 'en';
            const t = translations[savedLanguage];
            updateCurrentModelDisplay(modelName);
            if (!isInitialLoad) {
                alert(t.modelSelected.replace('%s', modelName));
            }
        }

        function updateCurrentModelDisplay(modelName) {
            const currentModelElement = document.getElementById('current-model');
            const savedLanguage = localStorage.getItem('selectedLanguage') || 'en';
            const t = translations[savedLanguage];
            
            if (currentModelElement) {
                currentModelElement.innerHTML = `${t.model}: <strong>${modelName || t.noModelSelected}</strong>`;
            }
        }

        // Cerrar modal al hacer clic fuera
        window.onclick = function(event) {
            const modal = document.getElementById('configModal');
            if (event.target === modal) {
                closeConfig();
            }
        }

        // Language translations
        const translations = {
            en: {
                newChat: "New chat",
                settings: "Settings",
                availableModels: "Available AI Models",
                model: "Model",
                send: "Send a message...",
                thinking: [
                    "Analyzing your question...",
                    "Processing information...",
                    "Elaborating a response...",
                    "Thinking...",
                    "Working on it..."
                ],
                delete: "Delete",
                copy: "Copy",
                download: "Download",
                configuration: "Settings",
                close: "Close",
                select: "Select",
                size: "Size",
                noModelSelected: "not selected",
                modelSelected: "Model %s selected successfully",
                theme: "Theme",
                language: "Language",
                dark: "Dark",
                light: "Light"
            },
            es: {
                newChat: "Nuevo chat",
                settings: "Configuración",
                availableModels: "Modelos de IA Disponibles",
                model: "Modelo",
                send: "Envía un mensaje...",
                thinking: [
                    "Analizando tu pregunta...",
                    "Procesando la información...",
                    "Elaborando una respuesta...",
                    "Pensando...",
                    "Trabajando en ello..."
                ],
                delete: "Eliminar",
                copy: "Copiar",
                download: "Descargar",
                configuration: "Configuración",
                close: "Cerrar",
                select: "Seleccionar",
                size: "Tamaño",
                noModelSelected: "no seleccionado",
                modelSelected: "Modelo %s seleccionado correctamente",
                theme: "Tema",
                language: "Idioma",
                dark: "Oscuro",
                light: "Claro"
            }
        };

        // Function to change language
        function changeLanguage(lang) {
            localStorage.setItem('selectedLanguage', lang);
            updateUILanguage(lang);
        }

        // Function to update UI text
        function updateUILanguage(lang) {
            const t = translations[lang];
            
            // Update static elements
            document.querySelector('.new-chat-btn').innerHTML = `
                <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                ${t.newChat}
            `;
            
            document.querySelector('.config-button').innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path>
                </svg>
                ${t.settings}
            `;
            
            // Update configuration titles
            document.getElementById('languageTitle').textContent = t.language;
            document.getElementById('themeTitle').textContent = t.theme;
            document.getElementById('darkOption').textContent = t.dark;
            document.getElementById('lightOption').textContent = t.light;
            
            document.querySelector('#message-input').placeholder = t.send;
            document.querySelector('#availableModelsTitle').textContent = t.availableModels;
            document.querySelector('.modal-title').textContent = t.configuration;
            
            // Update current model text
            const currentModelText = document.querySelector('#current-model');
            if (currentModelText) {
                const modelName = localStorage.getItem('selectedModel');
                currentModelText.innerHTML = `${t.model}: <strong>${modelName || t.noModelSelected}</strong>`;
            }

            // Update delete buttons in chat history
            const deleteButtons = document.querySelectorAll('.delete-btn');
            deleteButtons.forEach(button => {
                button.textContent = t.delete;
            });

            // Update model list if it exists
            const modelList = document.getElementById('modelList');
            if (modelList) {
                const selectButtons = modelList.querySelectorAll('.model-select');
                selectButtons.forEach(button => {
                    button.textContent = t.select;
                });

                const sizeTexts = modelList.querySelectorAll('.model-details');
                sizeTexts.forEach(sizeText => {
                    const size = sizeText.textContent.split(': ')[1];
                    sizeText.textContent = `${t.size}: ${size}`;
                });
            }
        }

        // Agregar la función para cambiar el tema
        function changeTheme(theme) {
            document.documentElement.className = theme;
            localStorage.setItem('selectedTheme', theme);
        }

        // Modificar el inicializador para incluir el tema
        document.addEventListener('DOMContentLoaded', () => {
            // Set initial language
            const savedLanguage = localStorage.getItem('selectedLanguage') || 'en';
            document.getElementById('languageSelect').value = savedLanguage;
            
            // Set initial theme
            const savedTheme = localStorage.getItem('selectedTheme') || 'dark';
            document.getElementById('themeSelect').value = savedTheme;
            document.documentElement.className = savedTheme;
            
            // Update UI with correct language
            updateUILanguage(savedLanguage);
            
            // Load available models at startup
            loadAvailableModels();
            
            // Initialize textarea
            const textarea = document.getElementById('message-input');
            autoResize(textarea);
            textarea.focus();
        });

        // Agregar manejador para la subida de PDFs
        document.getElementById('pdf-upload').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            if (file.type !== 'application/pdf') {
                alert('Por favor, selecciona un archivo PDF');
                return;
            }

            const formData = new FormData();
            formData.append('file', file);

            // Mostrar mensaje de carga
            appendMessageToUI('Subiendo y procesando PDF...', true);

            fetch('/upload', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    currentPdfFile = data.filename;
                    totalChunks = data.num_chunks;
                    currentChunkIndex = 0;
                    // Marcar este chat como uno que usa PDF
                    pdfChats.add(currentChatId);
                    updatePdfInfo();
                    
                    // Guardar información del PDF en el historial del chat
                    if (messageHistory[currentChatId]) {
                        messageHistory[currentChatId].push({
                            content: `PDF "${data.filename}" procesado exitosamente.  Ahora puedes hacer preguntas sobre su contenido.`,
                            isUser: false,
                            timestamp: Date.now(),
                            pdfFile: data.filename,
                            totalChunks: data.num_chunks,
                            chunkIndex: 0
                        });
                    }
                    
                    appendMessageToUI(`PDF "${data.filename}" procesado exitosamente.  Ahora puedes hacer preguntas sobre su contenido.`, false);
                } else {
                    appendMessageToUI(`Error al procesar el PDF: ${data.error}`, false);
                }
            })
            .catch(error => {
                appendMessageToUI(`Error al subir el PDF: ${error.message}`, false);
            });
        });

        // Agregar manejador para la subida de imágenes
        document.getElementById('image-upload').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            // Crear un nuevo chat si no hay uno activo
            if (!currentChatId) {
                createNewChat();
            }

            const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp', 'image/tiff'];
            if (!validImageTypes.includes(file.type)) {
                alert('Por favor, selecciona una imagen válida (JPEG, PNG, GIF, BMP, WEBP, TIFF)');
                return;
            }

            const formData = new FormData();
            formData.append('file', file);
            formData.append('chat_id', currentChatId);  // Agregar el ID del chat al FormData

            // Mostrar mensaje de carga
            appendMessageToUI('Subiendo y procesando imagen...', true);

            fetch('/upload_image', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Crear el mensaje con la imagen
                    const message = `
                        <div class="uploaded-image-container">
                            <img src="${data.image_url}" alt="Imagen subida" class="uploaded-image">
                        </div>
                        <p>${data.message}</p>
                    `;
                    
                    // Guardar información de la imagen en el historial del chat
                    if (messageHistory[currentChatId]) {
                        messageHistory[currentChatId].push({
                            content: message,
                            isUser: false,
                            timestamp: Date.now(),
                            imageFile: data.filename
                        });
                    }
                    
                    appendMessageToUI(message, false);
                } else {
                    appendMessageToUI(`Error al procesar la imagen: ${data.error}`, false);
                }
            })
            .catch(error => {
                appendMessageToUI(`Error al subir la imagen: ${error.message}`, false);
            });
        });

        function handleDragOver(event) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy'; // Indicate that a copy action is allowed
            console.log('Drag over event detected');
        }

        function handleDrop(event) {
            event.preventDefault();
            const files = event.dataTransfer.files;
            console.log('Drop event detected with files:', files);
            if (files.length > 0) {
                uploadFiles(files);
            }
        }

        function handlePaste(event) {
            const items = (event.clipboardData || event.originalEvent.clipboardData).items;
            console.log('Paste event detected with items:', items);
            for (let i = 0; i < items.length; i++) {
                if (items[i].kind === 'file') {
                    const file = items[i].getAsFile();
                    uploadFiles([file]);
                }
            }
        }

        function uploadFiles(files) {
            const formData = new FormData();
            for (let i = 0; i < files.length; i++) {
                formData.append('file', files[i]);
            }
            formData.append('chat_id', currentChatId);  // Ensure chat_id is included
            fetch('/upload_image', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    console.log('File uploaded successfully');
                    const message = `
                        <div class="uploaded-image-container">
                            <img src="${data.image_url}" alt="Imagen subida" class="uploaded-image">
                        </div>
                        <p>${data.message}</p>
                    `;
                    appendMessageToUI(message, false);
                } else {
                    console.error('Error uploading file:', data.error);
                }
            })
            .catch(error => {
                console.error('Error:', error);
            });
        }
