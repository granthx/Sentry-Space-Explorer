/**
 * Space Explorer AI Assistant - Frontend Client
 */

(function () {
  "use strict";

  var MAX_HISTORY = 20;
  var state = {
    history: [], // { role: "user" | "assistant", content: string }
    abortController: null,
    isSubmitting: false,
    lastUserMessage: ""
  };

  function getElements() {
    return {
      log: document.getElementById("chat-log"),
      form: document.getElementById("chat-form"),
      input: document.getElementById("chat-input"),
      btnSend: document.getElementById("btn-send"),
      btnStop: document.getElementById("btn-stop"),
      btnClear: document.getElementById("btn-clear-chat"),
      charCounter: document.getElementById("char-counter"),
      typingIndicator: document.getElementById("typing-indicator"),
      setupNotice: document.getElementById("assistant-setup-notice"),
      promptsContainer: document.getElementById("suggested-prompts")
    };
  }

  // ---------------- DOM Rendering Helpers (Strict textContent) ----------------

  function scrollChatToBottom() {
    var els = getElements();
    if (els.log) {
      els.log.scrollTop = els.log.scrollHeight;
    }
  }

  function appendUserBubble(text) {
    var els = getElements();
    if (!els.log) return;

    var bubble = document.createElement("div");
    bubble.className = "chat-bubble user-bubble";

    var header = document.createElement("div");
    header.className = "bubble-header";
    var sender = document.createElement("span");
    sender.className = "sender-name";
    sender.textContent = "You";
    header.appendChild(sender);

    var content = document.createElement("div");
    content.className = "bubble-content";
    var p = document.createElement("p");
    p.textContent = text;
    content.appendChild(p);

    bubble.appendChild(header);
    bubble.appendChild(content);
    els.log.appendChild(bubble);
    scrollChatToBottom();
  }

  function appendAssistantBubble(replyText, toolCalls) {
    var els = getElements();
    if (!els.log) return;

    var bubble = document.createElement("div");
    bubble.className = "chat-bubble assistant-bubble";

    var header = document.createElement("div");
    header.className = "bubble-header";
    var sender = document.createElement("span");
    sender.className = "sender-name";
    sender.textContent = "Space Explorer Assistant";
    header.appendChild(sender);

    var content = document.createElement("div");
    content.className = "bubble-content";

    // Split text into paragraphs cleanly using textContent
    var paragraphs = (replyText || "").split(/\n\s*\n/);
    paragraphs.forEach(function (para) {
      var trimmed = para.trim();
      if (!trimmed) return;
      var p = document.createElement("p");
      p.textContent = trimmed;
      content.appendChild(p);
    });

    // Tool Provenance Chips
    if (toolCalls && toolCalls.length > 0) {
      var toolsContainer = document.createElement("div");
      toolsContainer.className = "tools-used-container";

      toolCalls.forEach(function (tc) {
        var details = document.createElement("details");
        details.className = "tool-details";

        var summary = document.createElement("summary");
        summary.textContent = "Used: " + tc.name + (tc.ok ? "" : " (failed)");
        details.appendChild(summary);

        var pre = document.createElement("pre");
        pre.textContent = JSON.stringify(tc.input || {}, null, 2);
        details.appendChild(pre);

        toolsContainer.appendChild(details);
      });
      content.appendChild(toolsContainer);
    }

    bubble.appendChild(header);
    bubble.appendChild(content);
    els.log.appendChild(bubble);
    scrollChatToBottom();
  }

  function appendErrorBubble(errMsg, allowRetry) {
    var els = getElements();
    if (!els.log) return;

    var bubble = document.createElement("div");
    bubble.className = "chat-bubble assistant-bubble";
    bubble.style.borderLeftColor = "var(--danger)";

    var header = document.createElement("div");
    header.className = "bubble-header";
    header.textContent = "Assistant Error";

    var content = document.createElement("div");
    content.className = "bubble-content";

    var p = document.createElement("p");
    p.textContent = errMsg;
    content.appendChild(p);

    if (allowRetry) {
      var retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.className = "btn-retry";
      retryBtn.textContent = "Retry message \u21bb";
      retryBtn.addEventListener("click", function () {
        bubble.remove();
        sendMessage(state.lastUserMessage);
      });
      content.appendChild(retryBtn);
    }

    bubble.appendChild(header);
    bubble.appendChild(content);
    els.log.appendChild(bubble);
    scrollChatToBottom();
  }

  // ---------------- Chat Turn Flow ----------------

  function setSubmittingState(isSubmitting) {
    state.isSubmitting = isSubmitting;
    var els = getElements();

    if (els.btnSend) els.btnSend.disabled = isSubmitting;
    if (els.input) els.input.disabled = isSubmitting;
    if (els.btnStop) els.btnStop.style.display = isSubmitting ? "inline-block" : "none";
    if (els.typingIndicator) els.typingIndicator.style.display = isSubmitting ? "flex" : "none";

    if (!isSubmitting && els.input) {
      els.input.focus();
    }
  }

  function sendMessage(text) {
    var trimmed = (text || "").trim();
    if (!trimmed || state.isSubmitting) return;

    state.lastUserMessage = trimmed;
    appendUserBubble(trimmed);

    // Keep memory history bounded
    state.history.push({ role: "user", content: trimmed });
    if (state.history.length > MAX_HISTORY) {
      state.history = state.history.slice(state.history.length - MAX_HISTORY);
    }

    var els = getElements();
    if (els.input) {
      els.input.value = "";
      updateCharCounter();
    }

    setSubmittingState(true);
    state.abortController = new AbortController();

    window.SpaceAPI.assistantChat(state.history, state.abortController.signal)
      .then(function (res) {
        setSubmittingState(false);
        state.abortController = null;

        if (res && res.reply) {
          state.history.push({ role: "assistant", content: res.reply });
          if (state.history.length > MAX_HISTORY) {
            state.history = state.history.slice(state.history.length - MAX_HISTORY);
          }
          appendAssistantBubble(res.reply, res.tool_calls);
        }
      })
      .catch(function (err) {
        setSubmittingState(false);
        state.abortController = null;

        if (err.name === "AbortError") {
          appendErrorBubble("Investigation cancelled.", false);
          return;
        }

        if (err.status === 503) {
          if (els.setupNotice) els.setupNotice.style.display = "block";
          appendErrorBubble("The assistant is not configured on the backend. Please add GROQ_API_KEY to backend/.env.", false);
          return;
        }

        if (err.status === 429) {
          var retryWait = err.retryAfter || "60";
          appendErrorBubble("Too many questions. Rate limit reached. Try again in " + retryWait + " seconds.", true);
          return;
        }

        appendErrorBubble(err.message || "Failed to contact the assistant.", true);
      });
  }

  function updateCharCounter() {
    var els = getElements();
    if (els.input && els.charCounter) {
      var len = els.input.value.length;
      els.charCounter.textContent = len + " / 2000";
    }
  }

  function clearChat() {
    if (state.abortController) {
      state.abortController.abort();
    }
    state.history = [];
    state.lastUserMessage = "";
    setSubmittingState(false);

    var els = getElements();
    if (els.log) {
      while (els.log.firstChild) els.log.removeChild(els.log.firstChild);
      // Re-add welcome bubble safely with DOM elements
      var welcome = document.createElement("div");
      welcome.className = "chat-bubble assistant-bubble";

      var header = document.createElement("div");
      header.className = "bubble-header";
      var sender = document.createElement("span");
      sender.className = "sender-name";
      sender.textContent = "Space Explorer Assistant";
      header.appendChild(sender);

      var content = document.createElement("div");
      content.className = "bubble-content";
      var p = document.createElement("p");
      p.textContent = "Hello! I can answer questions by querying live NASA data on near-Earth asteroids, Mars rover manifests, and astronomy pictures. What would you like to explore?";
      content.appendChild(p);

      welcome.appendChild(header);
      welcome.appendChild(content);
      els.log.appendChild(welcome);
    }
  }

  // ---------------- Event Listeners & Setup ----------------

  function setupEvents() {
    var els = getElements();

    if (els.form) {
      els.form.addEventListener("submit", function (e) {
        e.preventDefault();
        sendMessage(els.input.value);
      });
    }

    if (els.input) {
      els.input.addEventListener("input", updateCharCounter);
      els.input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendMessage(els.input.value);
        }
      });
    }

    if (els.btnStop) {
      els.btnStop.addEventListener("click", function () {
        if (state.abortController) {
          state.abortController.abort();
        }
      });
    }

    if (els.btnClear) {
      els.btnClear.addEventListener("click", clearChat);
    }

    if (els.promptsContainer) {
      els.promptsContainer.addEventListener("click", function (e) {
        var chip = e.target.closest(".prompt-chip");
        if (chip) {
          var prompt = chip.getAttribute("data-prompt");
          if (prompt) {
            sendMessage(prompt);
          }
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupEvents);
  } else {
    setupEvents();
  }
})();
