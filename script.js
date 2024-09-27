document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const sendButton = document.getElementById('send-button');
    const userInput = document.getElementById('user-input');
    const conversationsList = document.getElementById('conversations');
    const newConversationButton = document.getElementById('new-conversation');

    let currentConversationId = null;

    // Funzione per caricare le conversazioni esistenti
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

                    // Aggiungi listener per selezionare la conversazione
                    li.addEventListener('click', () => {
                        currentConversationId = conv.conversation_id;
                        loadConversation(conv.conversation_id);
                        updateActiveConversation(conv.conversation_id);
                    });

                    // Creazione del pulsante di eliminazione
                    const deleteButton = document.createElement('button');
                    deleteButton.textContent = '✕';
                    deleteButton.classList.add('delete-button');

                    // Prevenire la propagazione del click sul pulsante di eliminazione
                    deleteButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        deleteConversation(conv.conversation_id, conv.conversation_name);
                    });

                    li.appendChild(deleteButton);
                    conversationsList.appendChild(li);
                });

                // Aggiorna l'evidenziazione della conversazione attiva
                updateActiveConversation(currentConversationId);
            })
            .catch(error => console.error('Errore nel caricamento delle conversazioni:', error));
    }

    // Funzione per aggiornare l'evidenziazione della conversazione attiva
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

    // Funzione per eliminare una conversazione
    function deleteConversation(conversationId, conversationName) {
        const confirmDelete = confirm(`Sei sicuro di voler eliminare la conversazione "${conversationName}"?`);
        if (confirmDelete) {
            fetch(`/api/conversations?id=${conversationId}`, {
                method: 'DELETE',
            })
                .then(response => {
                    if (response.ok) {
                        // Se la conversazione eliminata era quella attiva, resetta la chat
                        if (currentConversationId === conversationId) {
                            currentConversationId = null;
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

    // Funzione per caricare una conversazione specifica
    function loadConversation(conversationId) {
        fetch(`/api/conversations?id=${conversationId}`)
            .then(response => response.json())
            .then(data => {
                chatWindow.innerHTML = '';
                data.messages.forEach(msg => {
                    displayMessage(msg.role, msg.content);
                });
            })
            .catch(error => console.error('Errore nel caricamento della conversazione:', error));
    }








    // Funzione per formattare il testo racchiuso tra **<testo>** in grassetto
    function formatBoldText(text) {
        const boldRegex = /\*\*(.*?)\*\*/g;
        const formattedText = text.replace(boldRegex, '<strong class="highlighted-text">$1</strong>');
        // Applica la formattazione corsiva dopo aver applicato il grassetto
        return formatItalicText(formattedText);
    }

    // Funzione per formattare il testo racchiuso tra `testo` in corsivo
    function formatItalicText(text) {
        const italicRegex = /`([^`]+)`/g;
        return text.replace(italicRegex, '<em>$1</em>');
    }





    // Funzione per visualizzare un messaggio
    function displayMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', role);
    
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('content');
    
        // Suddividi il contenuto in parti
        const messageParts = parseMessageContent(content);
    
        messageParts.forEach(part => {
            if (part.type === 'code') {
                const pre = document.createElement('pre');
                const code = document.createElement('code');
                code.classList.add(part.language || 'plaintext');
    
                // Assegna il contenuto del codice
                code.textContent = part.code.trim(); // Usa textContent per evitare l'inserimento di HTML
    
                pre.appendChild(code);
    
                // Crea il pulsante di copia
                const copyButton = document.createElement('button');
                copyButton.textContent = 'Copia';
                copyButton.classList.add('copy-button');
    
                copyButton.addEventListener('click', () => {
                    // Copia il codice negli appunti
                    const codeText = part.code.trim();
                    navigator.clipboard.writeText(codeText).then(() => {
                        // Fornisci un feedback all'utente
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
    
                // Inizializza Highlight.js sul blocco di codice
                hljs.highlightElement(code);
                // Inizializza i numeri di riga
                hljs.lineNumbersBlock(code);
            } else if (part.type === 'separator') {
                const separatorDiv = document.createElement('div');
                separatorDiv.classList.add('separator');
                contentDiv.appendChild(separatorDiv);
            } else if (part.type === 'title') {
                const titleElement = document.createElement('div');
                titleElement.classList.add('message-title', `title-level-${part.level}`);
                titleElement.innerHTML = formatBoldText(part.text);
                contentDiv.appendChild(titleElement);
            } else {
                const textParagraph = document.createElement('p');
                textParagraph.innerHTML = formatBoldText(part.text.trim());
                contentDiv.appendChild(textParagraph);
            }
        });
    
        messageDiv.appendChild(contentDiv);
        chatWindow.appendChild(messageDiv);
    
        // Scrolla la chat per mostrare il nuovo messaggio
        messageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Funzione per verificare se il messaggio contiene un blocco di codice
    function isCodeBlock(text) {
        return /```[\s\S]*```/.test(text);
    }

    // Funzione per estrarre il codice e la lingua dal blocco di codice
    function extractCode(text) {
        const regex = /```(\w+)?\n([\s\S]*?)```/g;
        const matches = regex.exec(text);
        return {
            language: matches[1] || '',
            code: matches[2] || text
        };
    }


    // Variabile per il loading indicator
let loadingIndicator = null;

// Funzione per mostrare l'animazione di caricamento
function showLoading() {
    // Crea il loading indicator se non esiste
    if (!loadingIndicator) {
        loadingIndicator = document.createElement('div');
        loadingIndicator.classList.add('loading-indicator');
        loadingIndicator.innerHTML = `<span>Caricamento...</span>`;
    }

    // Aggiungi il loading indicator al chatWindow
    chatWindow.appendChild(loadingIndicator);

    // Scorri la chat fino alla fine per mostrare il loading indicator
    loadingIndicator.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Funzione per nascondere l'animazione di caricamento
function hideLoading() {
    if (loadingIndicator) {
        chatWindow.removeChild(loadingIndicator);
        loadingIndicator = null; // Resetta la variabile
    }
}

    // Gestione dell'invio del messaggio
    sendButton.addEventListener('click', () => {
        const message = userInput.value.trim();
        if (message === '') return;
      
        displayMessage('user', message);
        userInput.value = '';
      
        showLoading(); // Mostra l'animazione di caricamento dopo aver visualizzato il messaggio dell'utente
      
        fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            conversation_id: currentConversationId,
            message: message,
          }),
        })
          .then(async (response) => {
            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Errore nella risposta del server');
            }
            return response.json();
          })
          .then((data) => {
            currentConversationId = data.conversation_id;
            hideLoading(); // Nasconde l'animazione una volta ricevuta la risposta
            displayMessage('assistant', data.response);
          })
          .catch((error) => {
            console.error('Errore nella comunicazione con l\'API:', error.message);
            hideLoading(); // Nasconde l'animazione anche in caso di errore
            displayMessage('assistant', 'Si è verificato un errore. Per favore riprova.');
          });
      });

    // Creazione di una nuova conversazione
    newConversationButton.addEventListener('click', () => {
        const conversationName = prompt('Inserisci un nome per la nuova conversazione:');
        if (conversationName) {
            fetch('/api/conversations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ conversation_name: conversationName })
            })
                .then(response => response.json())
                .then(data => {
                    currentConversationId = data.conversation_id;
                    chatWindow.innerHTML = '';
                    loadConversations();
                })
                .catch(error => console.error('Errore nella creazione della conversazione:', error));
        }
    });

    // Carica le conversazioni all'avvio
    loadConversations();

    // Funzione per suddividere il testo in parti di testo e separatori
    function parseMessageContent(content) {
        const codeRegex = /```(\w*)\s*\n?([\s\S]*?)\n?```/g;
        const parts = [];
        let lastIndex = 0;
        let match;
    
        while ((match = codeRegex.exec(content)) !== null) {
            // Testo prima del blocco di codice
            if (match.index > lastIndex) {
                const textBefore = content.substring(lastIndex, match.index);
                parseTextParts(textBefore, parts);
            }
    
            // Blocco di codice
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
    
    // Funzione per suddividere il testo in parti di testo, separatori e titoli
    function parseTextParts(text, parts) {
        const separatorRegex = /^---$/gm;
        const titleRegex = /^(#{1,3})\s*(.*)$/gm;
        let lastIndex = 0;
        let match;
    
        while ((match = titleRegex.exec(text)) !== null) {
            // Testo prima del titolo
            if (match.index > lastIndex) {
                const precedingText = text.substring(lastIndex, match.index);
                parseSeparatorsAndText(precedingText, parts);
            }
    
            // Aggiungi il titolo con il livello
            const level = match[1].length; // Numero di '#'
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
    
    // Funzione per suddividere il testo in separatori e testo normale
    function parseSeparatorsAndText(text, parts) {
        const separatorRegex = /^---$/gm;
        let lastIndex = 0;
        let match;
    
        while ((match = separatorRegex.exec(text)) !== null) {
            // Testo prima del separatore
            if (match.index > lastIndex) {
                parts.push({
                    type: 'text',
                    text: text.substring(lastIndex, match.index)
                });
            }
            // Aggiungi il separatore
            parts.push({ type: 'separator' });
            lastIndex = separatorRegex.lastIndex;
        }
    
        // Testo dopo l'ultimo separatore
        if (lastIndex < text.length) {
            parts.push({
                type: 'text',
                text: text.substring(lastIndex)
            });
        }
    }


    
});


