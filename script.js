document.addEventListener('DOMContentLoaded', () => {
    // Riferimenti a vari elementi del DOM
    const chatWindow = document.getElementById('chat-window');
    const sendButton = document.getElementById('send-button');
    const userInput = document.getElementById('user-input');
    const conversationsList = document.getElementById('conversations');
    const newConversationButton = document.getElementById('new-conversation');
    const modelSelect = document.getElementById('model-select');

    let pendingImages = []; // Array con i base64 delle immagini in attesa di invio

    const uploadButton = document.getElementById('upload-button');
    const uploadInput   = document.getElementById('upload-input');

    // Quando clicco su “Allega Immagine” apro il file-selector
    uploadButton.addEventListener('click', () => {
        uploadInput.click();
    });

    // Leggo i file selezionati e li converto in base64
    uploadInput.addEventListener('change', async (event) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;
      
        for (let file of files) {
          try {
            // Converte il file locale in base64
            const base64Data = await convertFileToBase64(file);
      
            // Upload del base64 a /api/uploadImage => ottengo un URL Cloudinary
            const cloudUrl = await uploadBase64ToCloudinary(base64Data);
      
            // Nel pendingImages salvo entrambi
            pendingImages.push({
              base64: base64Data,
              url: cloudUrl
            });
      
            // Visualizzo subito un'anteprima in chat con l'URL Cloudinary
            displayImageMessage('user', cloudUrl);
      
          } catch (err) {
            console.error('Errore durante la generazione/upload base64:', err);
          }
        }
        uploadInput.value = '';
      });
      

      async function uploadBase64ToCloudinary(base64String) {
        const formData = new FormData();
        formData.append('base64', base64String);
      
        const response = await fetch('/api/uploadImage', {
          method: 'POST',
          body: formData
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Errore nell\'upload');
        }
        return data.url; // L'URL di Cloudinary
      }


      function convertFileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                resolve(reader.result.replace(/^data:image\/[a-zA-Z]+;base64,/, ''));
            };
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(file);
        });
    }



    function displayTempImageMessage(base64Image) {
        // Visualizza un “box messaggio” con l’anteprima dell’immagine
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', 'user');  // o 'assistant' se preferisci
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('content');
    
        // Crea un <img> con la base64
        const imageElem = document.createElement('img');
        imageElem.src = `data:image/jpeg;base64,${base64Image}`;
        imageElem.style.maxWidth = '200px';
        imageElem.style.borderRadius = '8px';
    
        contentDiv.appendChild(imageElem);
        messageDiv.appendChild(contentDiv);
        chatWindow.appendChild(messageDiv);
    
        messageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // --- Gestione stato della formattazione ---
    // Di default la formattazione è ATTIVA (checkbox non spuntato).
    let disableFormatting = false;
    const disableFormattingCheckbox = document.getElementById('disable-formatting');
    if (disableFormattingCheckbox) {
      disableFormattingCheckbox.addEventListener('change', (e) => {
        disableFormatting = e.target.checked;
        // Quando l'utente cambia lo stato della formattazione,
        // ri-renderizziamo i messaggi della conversazione corrente (se presente).
        renderMessages();
      });
    }

    // Id della conversazione attuale
    let currentConversationId = null;

    // Array che contiene i messaggi dell'attuale conversazione
    let currentMessages = [];

    // Modello selezionato
    let selectedModel = 'o1-mini'; 
    if (modelSelect) {
      selectedModel = modelSelect.value;
      
    }
    modelSelect.addEventListener('change', () => {
        selectedModel = modelSelect.value;
    });





    async function uploadFile(file) {
        const formData = new FormData();
        formData.append('fileInputName', file);
      
        const response = await fetch('/api/uploadImage', {
          method: 'POST',
          body: formData
        });
        const data = await response.json();
        return data.url; // L’URL dell’immagine su Cloudinary
      }

    /**
     * Carica la lista di conversazioni esistenti dal server
     * e popola il menu laterale.
     */
    function loadConversations() {
        fetch('/api/conversations')
            .then(response => response.json())
            .then(data => {
                conversationsList.innerHTML = '';
                data.forEach(conv => {
                    const li = document.createElement('li');
                    li.textContent = conv.conversation_name;
                    li.dataset.id = conv.conversation_id;
                    li.classList.add('conversation-item');

                    // Listener per selezionare la conversazione
                    li.addEventListener('click', () => {
                        currentConversationId = conv.conversation_id;
                        loadConversation(conv.conversation_id);
                        updateActiveConversation(conv.conversation_id);
                    });

                    // Pulsante di eliminazione
                    const deleteButton = document.createElement('button');
                    deleteButton.textContent = '×'; // Simbolo 'x'
                    deleteButton.classList.add('delete-button');
                    // Preveniamo la propagazione per non scatenare il click sulla li
                    deleteButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        deleteConversation(conv.conversation_id, conv.conversation_name);
                    });

                    // Pulsante di anteprima
                    const previewButton = document.createElement('button');
                    previewButton.innerHTML = '🔍'; // Icona stile “lente”
                    previewButton.classList.add('preview-button');
                    previewButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        showPreview(conv.conversation_id);
                    });

                    // Aggiunta pulsanti alla li
                    li.appendChild(deleteButton);
                    li.appendChild(previewButton);
                    conversationsList.appendChild(li);
                });

                // Aggiorna l'evidenziazione della conversazione attiva
                updateActiveConversation(currentConversationId);
            })
            .catch(error => console.error('Errore nel caricamento delle conversazioni:', error));
    }

    /**
     * Aggiorna la classe 'active' sulla conversazione selezionata
     */
    function updateActiveConversation(conversationId) {
        const conversationItems = document.querySelectorAll('.conversation-item');
        conversationItems.forEach(item => {
            if (parseInt(item.dataset.id) === conversationId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    /**
     * Elimina la conversazione dal database e aggiorna la lista
     */
    function deleteConversation(conversationId, conversationName) {
        const confirmDelete = confirm(`Sei sicuro di voler eliminare la conversazione "${conversationName}"?`);
        if (confirmDelete) {
            fetch(`/api/conversations?id=${conversationId}`, {
                method: 'DELETE',
            })
                .then(response => {
                    if (response.ok) {
                        // Se la conversazione eliminata era quella attiva, resettiamo
                        if (currentConversationId === conversationId) {
                            currentConversationId = null;
                            currentMessages = [];
                            chatWindow.innerHTML = '';
                        }
                        loadConversations();
                    } else {
                        console.error('Errore nell\'eliminazione della conversazione.');
                    }
                })
                .catch(error => console.error('Errore nella comunicazione con l\'API:', error));
        }
    }

    /**
     * Carica dal server i messaggi di una conversazione specifica
     */
    function loadConversation(conversationId) {
        fetch(`/api/conversations?id=${conversationId}`)
            .then(response => response.json())
            .then(data => {
                // Salviamo i messaggi in currentMessages
                currentMessages = data.messages || [];
                renderMessages();
            })
            .catch(error => console.error('Errore nel caricamento della conversazione:', error));
    }

    function displayTextMessage(role, text) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', role);
    
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('content');
        // Se vuoi formattazione/disattivarla, decidi tu
        contentDiv.textContent = text;
    
        messageDiv.appendChild(contentDiv);
        chatWindow.appendChild(messageDiv);
        messageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      function displayImageMessage(role, imageUrl) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', role);
    
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('content');
    
        const imgElem = document.createElement('img');
        imgElem.src = imageUrl;
        imgElem.style.maxWidth = '200px';
        imgElem.style.borderRadius = '8px';
    
        contentDiv.appendChild(imgElem);
        messageDiv.appendChild(contentDiv);
        chatWindow.appendChild(messageDiv);
        messageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

    /**
     * renderMessages()
     * Svuota il chatWindow e visualizza i messaggi in currentMessages
     * rispettando lo stato di disableFormatting.
     */
    function renderMessages() {
        chatWindow.innerHTML = '';
        currentMessages.forEach(msg => {
          // msg avrà shape: { role: 'user'|'assistant', content: string, content_json: [{...}]|null }
          if (msg.content_json && Array.isArray(msg.content_json)) {
            // Cicla i blocchi
            msg.content_json.forEach(block => {
              if (block.type === 'text') {
                displayTextMessage(msg.role, block.text);
                if (block.type === 'image_url') {
                    // Preferisci la chiave block.cloud_url se esiste, 
                    // altrimenti fallback su block.image_url.url:
                    const finalLink = block.cloud_url || block.image_url.url;
                    displayImageMessage(msg.role, finalLink);
                  }
          } else {
            // Altrimenti, è un semplice testo
            displayTextMessage(msg.role, msg.content);
          }
        });
      }



    /**
     * Visualizza un singolo messaggio nel chatWindow.
     * Se disableFormatting è attivo e il ruolo è 'assistant',
     * mostriamo il testo raw (textContent) senza parse di blocchi di codice, etc.
     */
    function displayMessage(role, content, highlight = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', role);
        if (highlight) {
            messageDiv.classList.add('highlighted-message');
        }

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('content');

        if (role === 'assistant') {
            // Se formattazione disattivata => mostra testo raw
            if (disableFormatting) {
                const textParagraph = document.createElement('p');
                textParagraph.textContent = content.trim();
                contentDiv.appendChild(textParagraph);
            } 
            else {
                // Formattazione classica (code blocks, parseMessageContent, ecc.)
                const messageParts = parseMessageContent(content);
                messageParts.forEach(part => {
                    if (part.type === 'code') {
                        const pre = document.createElement('pre');
                        const code = document.createElement('code');
                        code.classList.add(part.language || 'plaintext');
                        code.textContent = part.code.trim();
                        pre.appendChild(code);

                        // Pulsante di copia
                        const copyButton = document.createElement('button');
                        copyButton.textContent = 'Copia';
                        copyButton.classList.add('copy-button');
                        copyButton.addEventListener('click', () => {
                            const codeText = part.code.trim();
                            navigator.clipboard.writeText(codeText).then(() => {
                                copyButton.textContent = 'Copiato!';
                                setTimeout(() => {
                                    copyButton.textContent = 'Copia';
                                }, 2000);
                            }).catch(err => {
                                console.error('Errore nel copiare il codice:', err);
                            });
                        });
                        pre.appendChild(copyButton);
                        contentDiv.appendChild(pre);

                        // Evidenzia sintassi
                        hljs.highlightElement(code);
                        hljs.lineNumbersBlock(code);
                    }
                    else if (part.type === 'separator') {
                        const separatorDiv = document.createElement('div');
                        separatorDiv.classList.add('separator');
                        contentDiv.appendChild(separatorDiv);
                    }
                    else if (part.type === 'title') {
                        const titleElement = document.createElement('div');
                        titleElement.classList.add('message-title', `title-level-${part.level}`);
                        titleElement.innerHTML = DOMPurify.sanitize(formatBoldText(part.text));
                        contentDiv.appendChild(titleElement);
                    }
                    else {
                        // Testo normale
                        const textParagraph = document.createElement('p');
                        textParagraph.innerHTML = DOMPurify.sanitize(formatBoldText(part.text.trim()));
                        contentDiv.appendChild(textParagraph);
                    }
                });
            }
        } 
        else {
            // Messaggi dell’utente (o altri ruoli) => testo raw
            const textParagraph = document.createElement('p');
            textParagraph.textContent = content.trim();
            contentDiv.appendChild(textParagraph);
        }

        messageDiv.appendChild(contentDiv);
        chatWindow.appendChild(messageDiv);

        // Scrolla la chat per mostrare il nuovo messaggio
        messageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * Funzione per formattare testo in grassetto e corsivo (solo assistant),
     * usata da parseMessageContent durante la formattazione
     */
    function formatBoldText(text) {
        const boldRegex = /\*\*(.*?)\*\*/g;
        const formattedText = text.replace(boldRegex, '<strong class="highlighted-text">$1</strong>');
        return formatItalicText(formattedText);
    }
    function formatItalicText(text) {
        const italicRegex = /`([^`]+)`/g;
        return text.replace(italicRegex, '<em>$1</em>');
    }

    /**
     * parseMessageContent(content)
     * Suddivide il testo in parti: code block, titoli, separatori, testo normale
     */
    function parseMessageContent(content) {
        const codeRegex = /```(\w*)\s*\n?([\s\S]*?)\n?```/g;
        const parts = [];
        let lastIndex = 0;
        let match;

        // Estrarre i blocchi di codice
        while ((match = codeRegex.exec(content)) !== null) {
            if (match.index > lastIndex) {
                const textBefore = content.substring(lastIndex, match.index);
                parseTextParts(textBefore, parts);
            }
            parts.push({
                type: 'code',
                language: match[1] || '',
                code: match[2]
            });
            lastIndex = codeRegex.lastIndex;
        }
        // Testo dopo l'ultimo blocco di codice
        if (lastIndex < content.length) {
            const textAfter = content.substring(lastIndex);
            parseTextParts(textAfter, parts);
        }
        return parts;
    }

    /**
     * parseTextParts(text, parts)
     * Riconosce titoli e separatori. Aggiorna l’array `parts` con i relativi oggetti.
     */
    function parseTextParts(text, parts) {
        const titleRegex = /^(#{1,3})\s*(.*)$/gm;
        let lastIndex = 0;
        let match;

        while ((match = titleRegex.exec(text)) !== null) {
            // Testo prima del titolo
            if (match.index > lastIndex) {
                const precedingText = text.substring(lastIndex, match.index);
                parseSeparatorsAndText(precedingText, parts);
            }
            const level = match[1].length; // #, ##, o ###
            const titleText = match[2].trim();

            parts.push({
                type: 'title',
                level: level,
                text: titleText
            });
            lastIndex = titleRegex.lastIndex;
        }

        // Testo dopo l'ultimo titolo
        if (lastIndex < text.length) {
            const remainingText = text.substring(lastIndex);
            parseSeparatorsAndText(remainingText, parts);
        }
    }

    /**
     * parseSeparatorsAndText(text, parts)
     * Suddivide ulteriormente per separatori (---).
     */
    function parseSeparatorsAndText(text, parts) {
        const separatorRegex = /^---$/gm;
        let lastIndex = 0;
        let match;

        while ((match = separatorRegex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parts.push({
                    type: 'text',
                    text: text.substring(lastIndex, match.index)
                });
            }
            parts.push({ type: 'separator' });
            lastIndex = separatorRegex.lastIndex;
        }
        if (lastIndex < text.length) {
            parts.push({
                type: 'text',
                text: text.substring(lastIndex)
            });
        }
    }

    // Loading indicator
    let loadingIndicator = null;
    function showLoading() {
        if (!loadingIndicator) {
            loadingIndicator = document.createElement('div');
            loadingIndicator.classList.add('loading-indicator');
            loadingIndicator.innerHTML = `<span>Caricamento...</span>`;
        }
        chatWindow.appendChild(loadingIndicator);
        loadingIndicator.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function hideLoading() {
        if (loadingIndicator) {
            chatWindow.removeChild(loadingIndicator);
            loadingIndicator = null;
        }
    }

    // Inviare il messaggio
    sendButton.addEventListener('click', () => {
        const userInputValue = userInput.value.trim();
        if (userInputValue === '' && pendingImages.length === 0) return;
      
        let content;
        if (pendingImages.length > 0) {
          content = [];
          if (userInputValue) {
            content.push({ type: 'text', text: userInputValue });
          }
          for (const imgObj of pendingImages) {
            content.push({
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imgObj.base64}`, // => invio base64
                detail: 'high'
              }
            });
          }
          pendingImages = [];
        } else {
          content = userInputValue;
        }
      
        // Visualizza internamente il testo subito (se vuoi)
        if (userInputValue) {
          displayTextMessage('user', userInputValue);
        }
        userInput.value = '';
      
        showLoading();
      
        fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: currentConversationId,
            message: content,
            model: selectedModel
          })
        })
        .then(res => res.json())
        .then(data => {
          currentConversationId = data.conversation_id;
          hideLoading();
          loadConversation(currentConversationId);
        })
        .catch(err => {
          console.error('Errore /api/chat:', err);
          hideLoading();
        });
      });
      
      // 4) Nella renderMessages (o dove crei i <img>):
      //   Sostituisci block.image_url.url con block.cloud_url se presente...
      function renderMessages() {
        chatWindow.innerHTML = '';
        currentMessages.forEach(msg => {
          if (msg.content_json && Array.isArray(msg.content_json)) {
            msg.content_json.forEach(block => {
              if (block.type === 'text') {
                displayTextMessage(msg.role, block.text);
              } else if (block.type === 'image_url') {
                // Se c'è block.cloud_url, usalo, altrimenti fallback al base64
                const finalUrl = block.cloud_url || block.image_url.url;
                displayImageMessage(msg.role, finalUrl);
              }
            });
          } else {
            displayTextMessage(msg.role, msg.content);
          }
        });
      }

    // Nuova conversazione
    newConversationButton.addEventListener('click', () => {
        const conversationName = prompt('Inserisci un nome per la nuova conversazione:');
        if (conversationName) {
            fetch('/api/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversation_name: conversationName })
            })
            .then(response => response.json())
            .then(data => {
                currentConversationId = data.conversation_id;
                currentMessages = [];
                chatWindow.innerHTML = '';
                loadConversations();
            })
            .catch(error => console.error('Errore nella creazione della conversazione:', error));
        }
    });

    // Carica le conversazioni all'avvio
    loadConversations();


    // =========================
    //  Modal Anteprima 
    // =========================
    const modal = document.getElementById('preview-modal');
    const closeButton = modal.querySelector('.close-button');

    closeButton.addEventListener('click', closePreview);
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            closePreview();
        }
    });
    function closePreview() {
        modal.style.display = 'none';
    }

    /**
     * showPreview(conversationId)
     * Mostra anteprima rapida della conversazione in un modal
     */
    function showPreview(conversationId) {
        fetch(`/api/conversations?id=${conversationId}`)
            .then(response => response.json())
            .then(data => {
                const previewMessagesDiv = document.getElementById('preview-messages');
                previewMessagesDiv.innerHTML = ''; 
                const messages = data.messages;

                messages.forEach((msg, index) => {
                    const messageDiv = document.createElement('div');
                    messageDiv.classList.add('message', msg.role);

                    const contentDiv = document.createElement('div');
                    contentDiv.classList.add('content');

                    let text = msg.content;
                    // Tronca i messaggi lunghi (opzionale)
                    if (text.length > 200) {
                        text = text.substring(0, 200) + '...';
                    }
                    contentDiv.textContent = text;
                    messageDiv.appendChild(contentDiv);
                    previewMessagesDiv.appendChild(messageDiv);

                    // Clic su un messaggio per “navigare”
                    messageDiv.addEventListener('click', () => {
                        navigateToMessage(conversationId, index);
                        closePreview();
                    });
                });

                modal.style.display = 'block';
            })
            .catch(error => console.error('Errore nel recupero della conversazione:', error));
    }

    /**
     * navigateToMessage(conversationId, messageIndex)
     * Carica la conversazione, scrolla al messaggio “messageIndex”
     * e lo evidenzia momentaneamente.
     */
    function navigateToMessage(conversationId, messageIndex) {
        currentConversationId = conversationId;
        updateActiveConversation(conversationId);

        fetch(`/api/conversations?id=${conversationId}`)
            .then(response => response.json())
            .then(data => {
                chatWindow.innerHTML = '';
                currentMessages = data.messages;
                currentMessages.forEach((msg, idx) => {
                    displayMessage(msg.role, msg.content, idx === messageIndex);
                });
                // Scrolla al messaggio evidenziato
                const messagesInChat = chatWindow.getElementsByClassName('message');
                if (messageIndex < messagesInChat.length) {
                    const targetMessage = messagesInChat[messageIndex];
                    targetMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Rimuove la classe highlight dopo 2 secondi
                    setTimeout(() => {
                        targetMessage.classList.remove('highlighted-message');
                    }, 2000);
                }
            })
            .catch(error => console.error('Errore nella navigazione alla conversazione:', error));
    }

});
