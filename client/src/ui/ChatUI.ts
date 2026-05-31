import type { ChatMessage } from "@patriot/shared";
import { CHAT_MAX_MESSAGE_LENGTH } from "@patriot/shared";

const MAX_VISIBLE = 5;
const FADE_DELAY = 5000;
const FADE_DURATION = 3000;

export class ChatUI {
  private container: HTMLElement;
  private logEl: HTMLElement;
  private inputEl: HTMLInputElement | null = null;
  private inputWrapper: HTMLElement | null = null;
  private messages: { msg: ChatMessage; el: HTMLElement }[] = [];
  private localSessionId = "";
  private isOpen = false;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private onSend: ((text: string) => void) | null = null;
  private onToggle: ((open: boolean) => void) | null = null;

  constructor() {
    this.container = document.createElement("div");
    this.container.id = "chat-ui";
    this.container.style.cssText = `
      position:fixed;bottom:110px;left:12px;width:clamp(220px,25vw,340px);
      z-index:960;pointer-events:none;font-family:'Courier New',monospace;
    `;

    this.logEl = document.createElement("div");
    this.logEl.id = "chat-log";
    this.logEl.style.cssText = `
      display:flex;flex-direction:column;gap:2px;max-height:140px;overflow:hidden;
      transition:opacity 0.5s;
    `;
    this.container.appendChild(this.logEl);

    document.body.appendChild(this.container);
  }

  init(sessionId: string, onSend: (text: string) => void, onToggle: (open: boolean) => void) {
    this.localSessionId = sessionId;
    this.onSend = onSend;
    this.onToggle = onToggle;
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.onToggle?.(true);
    this.logEl.style.opacity = "1";
    this.clearFadeTimer();

    if (!this.inputWrapper) {
      this.inputWrapper = document.createElement("div");
      this.inputWrapper.style.cssText = `
        display:flex;gap:4px;margin-top:4px;pointer-events:auto;
      `;

      this.inputEl = document.createElement("input");
      this.inputEl.type = "text";
      this.inputEl.maxLength = CHAT_MAX_MESSAGE_LENGTH;
      this.inputEl.placeholder = "Type a message...";
      this.inputEl.style.cssText = `
        flex:1;background:rgba(20,24,20,0.85);border:1px solid #556B2F;border-radius:4px;
        color:#ddd;font-family:'Courier New',monospace;font-size:13px;padding:4px 8px;
        outline:none;
      `;

      this.inputEl.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          const text = this.inputEl!.value.trim();
          if (text) this.onSend?.(text);
          this.close();
        } else if (e.key === "Escape") {
          this.close();
        }
      });

      this.inputWrapper.appendChild(this.inputEl);
      this.container.appendChild(this.inputWrapper);
    }

    this.inputWrapper.style.display = "flex";
    this.inputEl!.value = "";
    this.inputEl!.focus();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.onToggle?.(false);
    if (this.inputWrapper) this.inputWrapper.style.display = "none";
    this.startFadeTimer();
  }

  get chatOpen() { return this.isOpen; }

  addMessage(msg: ChatMessage, isHistory = false) {
    const el = document.createElement("div");
    const isLocal = msg.senderId === this.localSessionId;
    const nameColor = isLocal ? "#6699ff" : "#ddd";
    el.innerHTML = `<span style="color:${nameColor};font-weight:bold;font-size:12px;">${this.escapeHtml(msg.senderName)}</span><span style="color:#bbb;font-size:12px;">: ${this.escapeHtml(msg.text)}</span>`;
    el.style.cssText = `
      background:rgba(20,24,20,0.7);border-radius:3px;padding:2px 6px;
      opacity:${isHistory ? "0.5" : "1"};transition:opacity 0.5s;
    `;

    this.messages.push({ msg, el });
    this.logEl.appendChild(el);

    // Limit visible
    while (this.messages.length > MAX_VISIBLE) {
      const removed = this.messages.shift();
      removed?.el.remove();
    }

    // Reset opacity on all messages
    if (!isHistory) {
      this.messages.forEach((m) => (m.el.style.opacity = "1"));
      this.logEl.style.opacity = "1";
      this.startFadeTimer();
    }
  }

  private startFadeTimer() {
    this.clearFadeTimer();
    if (this.isOpen) return;
    this.fadeTimer = setTimeout(() => {
      this.logEl.style.opacity = "0";
    }, FADE_DELAY);
  }

  private clearFadeTimer() {
    if (this.fadeTimer) { clearTimeout(this.fadeTimer); this.fadeTimer = null; }
  }

  private escapeHtml(text: string) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  destroy() {
    this.clearFadeTimer();
    this.container.remove();
  }
}
