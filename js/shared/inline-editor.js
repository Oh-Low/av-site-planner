/**
 * Inline rename editor for list items (LED walls, projection screens, etc.).
 * @param {{
 *   listEl: HTMLElement,
 *   nameSelector?: string,
 *   itemSelector: string,
 *   getItemId: (itemEl: Element) => string | undefined,
 *   getName: (id: string) => string | undefined,
 *   setName: (id: string, name: string) => void,
 *   onCommit?: (id: string, previousName: string, newName: string) => void,
 *   onCancel?: () => void,
 * }} options
 */
export function createListNameEditor(options) {
  const nameSelector = options.nameSelector ?? ".grid-item-name";
  /** @type {HTMLInputElement | null} */
  let activeInput = null;

  function close() {
    options.listEl?.querySelectorAll(`${nameSelector}.is-editing`).forEach((el) => {
      el.classList.remove("is-editing");
    });
    activeInput?.remove();
    activeInput = null;
  }

  /** @param {HTMLElement} nameEl */
  function open(nameEl) {
    close();
    const item = nameEl.closest(options.itemSelector);
    if (!item || !options.listEl) return;

    const id = options.getItemId(item);
    if (!id) return;

    const currentName = options.getName(id);
    if (currentName === undefined) return;

    const listRect = options.listEl.getBoundingClientRect();
    const nameRect = nameEl.getBoundingClientRect();
    const input = document.createElement("input");
    input.type = "text";
    input.className = "grid-name-editor";
    input.maxLength = 48;
    input.value = currentName;
    input.style.left = `${nameRect.left - listRect.left}px`;
    input.style.top = `${nameRect.top - listRect.top}px`;
    input.style.width = `${Math.max(nameRect.width, 120)}px`;
    input.style.height = `${nameRect.height}px`;
    nameEl.classList.add("is-editing");

    const previousName = currentName;
    let dismissed = false;

    const commit = () => {
      if (dismissed) return;
      const text = input.value.trim();
      const nextName = text || previousName;
      options.setName(id, nextName);
      close();
      options.onCommit?.(id, previousName, nextName);
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        dismissed = true;
        close();
        options.onCancel?.();
      }
    });
    input.addEventListener("blur", commit);

    options.listEl.appendChild(input);
    activeInput = input;
    input.focus();
    input.select();
  }

  return { open, close };
}
