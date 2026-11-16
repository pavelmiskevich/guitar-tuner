/**
 * Копирование текста в буфер обмена с запасным путём.
 *
 * `navigator.clipboard` есть только в безопасном контексте (HTTPS), а в части
 * WebView его нет совсем; при отказе в разрешении `writeText` отклоняет промис.
 * Раньше это не проверялось, и пользователь видел «Скопировано», когда ничего
 * не скопировалось. Теперь подтверждение показывают только при `true`.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Отказ в разрешении или небезопасный контекст — пробуем старый способ.
  }
  return copyWithSelection(text);
}

/** Старый способ: выделить текст в скрытом поле и выполнить команду копирования. */
function copyWithSelection(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false;

  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.top = '0';
  field.style.left = '0';
  field.style.opacity = '0';
  field.style.pointerEvents = 'none';
  document.body.appendChild(field);

  try {
    field.select();
    // execCommand устарел, но это единственный путь там, где Clipboard API нет.
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
