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
        // Regex per catturare **testo**
        const boldRegex = /\*\*(.*?)\*\*/g;
        // Sostituisci con il testo in grassetto e dimensione aumentata
        return text.replace(boldRegex, '<strong class="highlighted-text">$1</strong>');
    }

    // Funzione per visualizzare un messaggio
    function displayMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', role);
    
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('content');
    
        // Suddividi il contenuto in parti di testo, codice e separatori
        const messageParts = parseMessageContent(content);
    
        messageParts.forEach(part => {
            if (part.type === 'code') {
                const pre = document.createElement('pre');
                const code = document.createElement('code');
                code.textContent = part.code.trim();
                code.classList.add(part.language || 'plaintext');
                pre.appendChild(code);
                contentDiv.appendChild(pre);
                // Inizializza Highlight.js
                hljs.highlightElement(code);
            } else if (part.type === 'separator') {
                const separatorDiv = document.createElement('div');
                separatorDiv.classList.add('separator');
                contentDiv.appendChild(separatorDiv);
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
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                conversation_id: currentConversationId,
                message: message
            })
        })
        .then(response => response.json())
        .then(data => {
            currentConversationId = data.conversation_id;
            hideLoading(); // Nasconde l'animazione una volta ricevuta la risposta
            displayMessage('assistant', data.response);
        })
        .catch(error => {
            console.error('Errore nella comunicazione con l\'API:', error);
            hideLoading(); // Nasconde l'animazione anche in caso di errore
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
function parseTextParts(text, parts) {
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
        parts.push({
            type: 'separator'
        });
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
    

    // Funzione per suddividere il messaggio in parti di testo e codice
    function parseMessageContent(content) {
        // Regex per codice, separatori e testo
        const codeRegex = /```(.*?)\n([\s\S]*?)\n```/g;
        const separatorRegex = /^---$/gm;
        const parts = [];
        let lastIndex = 0;
    
        // Prima, troviamo tutti i blocchi di codice
        let codeMatches;
        const codeBlocks = [];
        while ((codeMatches = codeRegex.exec(content)) !== null) {
            codeBlocks.push({
                type: 'code',
                language: codeMatches[1],
                code: codeMatches[2],
                start: codeMatches.index,
                end: codeRegex.lastIndex
            });
        }
    
        // Ora, creiamo un array di parti miste (testo, codice, separatori)
        let currentIndex = 0;
        for (let i = 0; i <= content.length; i++) {
            // Controlliamo se siamo all'inizio di un blocco di codice
            const codeBlock = codeBlocks.find(cb => cb.start === i);
            if (codeBlock) {
                // Aggiungiamo il testo prima del blocco di codice, se presente
                if (codeBlock.start > currentIndex) {
                    const textPart = content.substring(currentIndex, codeBlock.start);
                    parseTextParts(textPart, parts);
                }
                // Aggiungiamo il blocco di codice
                parts.push({
                    type: 'code',
                    language: codeBlock.language,
                    code: codeBlock.code
                });
                currentIndex = codeBlock.end;
                i = codeBlock.end - 1;
            } else if (i === content.length) {
                // Aggiungiamo il testo rimanente alla fine
                if (currentIndex < content.length) {
                    const textPart = content.substring(currentIndex);
                    parseTextParts(textPart, parts);
                }
            }
        }
        return parts;
    }


    
});


