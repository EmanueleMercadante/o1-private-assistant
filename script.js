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
                    li.addEventListener('click', () => {
                        currentConversationId = conv.conversation_id;
                        loadConversation(conv.conversation_id);
                    });
                    conversationsList.appendChild(li);
                });
            })
            .catch(error => console.error('Errore nel caricamento delle conversazioni:', error));
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

    // Funzione per visualizzare un messaggio
    function displayMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', role);

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('content');

        // Suddividi il contenuto in parti di testo e blocchi di codice
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
            } else {
                const textParagraph = document.createElement('p');
                textParagraph.textContent = part.text.trim();
                contentDiv.appendChild(textParagraph);
            }
        });

        messageDiv.appendChild(contentDiv);
        chatWindow.appendChild(messageDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
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

    // Gestione dell'invio del messaggio
    sendButton.addEventListener('click', () => {
        const message = userInput.value.trim();
        if (message === '') return;

        displayMessage('user', message);
        userInput.value = '';

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
                displayMessage('assistant', data.response);
            })
            .catch(error => console.error('Errore nella comunicazione con l\'API:', error));
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

    // Funzione per visualizzare un messaggio
    

    // Funzione per suddividere il messaggio in parti di testo e codice
    function parseMessageContent(content) {
        const regex = /```(\w+)?\n([\s\S]*?)\n```/g;
        const parts = [];
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(content)) !== null) {
            // Testo prima del blocco di codice
            if (match.index > lastIndex) {
                parts.push({
                    type: 'text',
                    text: content.substring(lastIndex, match.index)
                });
            }

            // Blocco di codice
            parts.push({
                type: 'code',
                language: match[1],
                code: match[2]
            });

            lastIndex = regex.lastIndex;
        }

        // Testo dopo l'ultimo blocco di codice
        if (lastIndex < content.length) {
            parts.push({
                type: 'text',
                text: content.substring(lastIndex)
            });
        }

        return parts;
    }
});