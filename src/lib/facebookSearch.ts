/**
 * Opens Facebook Pages search for a business name.
 * On mobile, attempts a deep link to the Facebook app first,
 * falling back to the web URL after a short timeout.
 */
export function openFacebookSearch(businessName: string) {
  const encoded = encodeURIComponent(businessName);
  const webUrl = `https://www.facebook.com/search/pages/?q=${encoded}`;

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  if (isMobile) {
    // Try Facebook app deep link
    const deepLink = `fb://facewebmodal/f?href=${encodeURIComponent(webUrl)}`;
    const start = Date.now();

    window.location.href = deepLink;

    // If we're still here after 1s, app didn't open → fallback
    setTimeout(() => {
      if (Date.now() - start < 2000) {
        window.open(webUrl, '_blank');
      }
    }, 1000);
  } else {
    window.open(webUrl, '_blank');
  }
}
