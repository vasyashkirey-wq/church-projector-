// ============================================================
// Меню застосунку.
// Головна причина існування цього меню — macOS. Без нього на Mac НЕ працюють
// Cmd+C / Cmd+V / Cmd+X / Cmd+A у полях вводу (пісні, Біблія, оголошення,
// PIN, назви виходів, налаштування), а також Cmd+Q / Cmd+M / Cmd+H.
// На Windows редагування працює й без меню, тож там смуга просто прихована.
//
// Винесено з main.js: не залежить від жодного спільного стану головного
// процесу (вікна, сервери) — лише Menu + process.platform.
// ============================================================
const { Menu } = require('electron');

function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  const template = [];

  // Меню з назвою застосунку — лише macOS (там воно обов'язкове).
  if (isMac) {
    template.push({
      label: 'Церква Проектор',
      submenu: [
        { role: 'about', label: 'Про «Церква Проектор»' },
        { type: 'separator' },
        { role: 'hide', label: 'Сховати' },
        { role: 'hideOthers', label: 'Сховати інші' },
        { role: 'unhide', label: 'Показати все' },
        { type: 'separator' },
        { role: 'quit', label: 'Вийти' }
      ]
    });
  }

  // Редагування — саме цей блок вмикає Cmd/Ctrl + C, V, X, A, Z на macOS.
  template.push({
    label: 'Редагування',
    submenu: [
      { role: 'undo', label: 'Скасувати' },
      { role: 'redo', label: 'Повторити' },
      { type: 'separator' },
      { role: 'cut', label: 'Вирізати' },
      { role: 'copy', label: 'Копіювати' },
      { role: 'paste', label: 'Вставити' },
      ...(isMac
        ? [{ role: 'pasteAndMatchStyle', label: 'Вставити як звичайний текст' },
           { role: 'delete', label: 'Видалити' },
           { role: 'selectAll', label: 'Вибрати все' }]
        : [{ role: 'delete', label: 'Видалити' },
           { type: 'separator' },
           { role: 'selectAll', label: 'Вибрати все' }])
    ]
  });

  // Вигляд — свідомо БЕЗ zoom-ролей (Cmd+=/-/0 зайняті власним масштабом UI
  // у index.html) і БЕЗ Reload (випадковий Cmd+R скинув би панель під час служби).
  template.push({
    label: 'Вигляд',
    submenu: [
      { role: 'togglefullscreen', label: 'На весь екран' },
      { type: 'separator' },
      { role: 'toggleDevTools', label: 'Інструменти розробника' }
    ]
  });

  // Вікно
  template.push({
    label: 'Вікно',
    submenu: isMac
      ? [{ role: 'minimize', label: 'Згорнути' },
         { role: 'zoom', label: 'Масштаб' },
         { type: 'separator' },
         { role: 'front', label: 'Усі вікна вперед' }]
      : [{ role: 'minimize', label: 'Згорнути' },
         { role: 'close', label: 'Закрити' }]
  });

  return Menu.buildFromTemplate(template);
}

// Будує меню й одразу встановлює його активним — те саме, що
// Menu.setApplicationMenu(buildAppMenu()) у виклику з main.js.
function applyAppMenu() {
  Menu.setApplicationMenu(buildAppMenu());
}

module.exports = { buildAppMenu, applyAppMenu };
