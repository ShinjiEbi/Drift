/* global document, window, Notification */  // utilisés dans les callbacks exécutés par le navigateur
// Bouton « Notifs téléphone » (ui.js setupNotifHandlers) × démarrage asynchrone (verrou d'onglet, app.js boot) :
// au rechargement, le bouton est initialisé AVANT le chargement de la sauvegarde.
import { banc } from './_banc.mjs';
const b = await banc();
const ctx = await b.context();
await ctx.grantPermissions(['notifications'], { origin: new URL(b.base).origin });
// Chromium headless peut répondre « denied » malgré l'autorisation : on simule la permission accordée
await ctx.addInitScript(() => { try { Object.defineProperty(Notification, 'permission', { get: () => 'granted' }); } catch (e) {} });
const page = await b.page(ctx);
await page.goto(b.base);
await b.waitGame(page);
const btn = () => page.evaluate(async () => ({ label: document.querySelector('#btnPushToggle')?.textContent, enabled: (await import('./src/notifications.js')).isPushEnabled(), perm: Notification.permission }));
// Le joueur active les notifications (clic)
await page.evaluate(() => document.querySelector('#btnPushToggle').click());
await page.waitForTimeout(300);
console.log('après activation      :', JSON.stringify(await btn()));
await page.evaluate(async () => (await import('./src/state.js')).save());
await page.reload();
await b.waitGame(page);
await page.waitForTimeout(800);
const r1 = await btn();
console.log('après rechargement    :', JSON.stringify(r1));
// Le joueur voit « 🔔 » et clique pour désactiver
await page.evaluate(() => document.querySelector('#btnPushToggle').click());
await page.waitForTimeout(300);
const r2 = await btn();
console.log('après clic « désactiver » :', JSON.stringify(r2), '| toast :', await page.textContent('#toast'));
b.check(r1.enabled && r1.label.includes('🔔'), 'après rechargement, le bouton reflète l\'état réel (activé)');
b.check(!r2.enabled && r2.label.includes('🔕'), 'le clic bascule bien vers « désactivé » (bouton cohérent avec l\'état réel)');
await b.fin();
