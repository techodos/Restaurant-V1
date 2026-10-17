/**
 * Any other storefront route: no sheet. Without this, a soft navigation from an open sheet to another
 * page (e.g. tray -> checkout) would keep the sheet mounted, because unmatched parallel slots keep state.
 */
export default function ModalCatchAll() {
  return null;
}
