export const THEME_STORAGE_KEY = 'common-ground-theme';
// Run before paint. With no saved override, CSS follows the browser preference live.
export const themeBootstrap = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}`;
