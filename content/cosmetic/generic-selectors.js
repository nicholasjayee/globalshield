// content/cosmetic/generic-selectors.js
// Universal ad, tracker, banner, and pop-up container CSS selectors.

(() => {
  'use strict';

  window.__SS_CONTENT = window.__SS_CONTENT || {};

  window.__SS_CONTENT.GENERIC_AD_SELECTORS = [
    // ── Google AdSense & Ad Manager ──
    'ins.adsbygoogle',
    'div[id^="google_ads_"]',
    'div[id^="aswift_"]',
    'iframe[id^="aswift_"]',
    'iframe[name^="aswift_"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googleadservices.com"]',

    // ── Common ad container classes & IDs ──
    '[class*="ad-banner"]',
    '[class*="ad-slot"]',
    '[class*="ad-container"]',
    '[class*="ad-wrapper"]',
    '[class*="adsbygoogle"]',
    '[class*="advertisement"]',
    '[class*="sponsored-content"]',
    '[class*="sponsored-post"]',
    '[id*="ad-banner"]',
    '[id*="ad-slot"]',
    '[id*="ad-container"]',
    '[id^="div-gpt-ad"]',

    // ── Sticky & floating video ads ──
    '[class*="sticky-ad"]',
    '[id*="sticky-ad"]',
    '[class*="floating-ad"]',
    '[id*="floating-ad"]',
    '[class*="video-ad-container"]',
    '[id*="video-ad-container"]',
    '[class*="ad-sticky-footer"]',

    // ── Content recommendation engines (Taboola / Outbrain / Revcontent / Mgid) ──
    '[id^="taboola-"]',
    '[class*="trc_related_container"]',
    '[class*="OUTBRAIN"]',
    '[id^="outbrain_widget"]',
    '[class*="rc-wc-"]',
    '[id^="M"][id*="294"]', // Mgid widget id pattern
    '[class*="mgid-"]',

    // ── Modals & interstitial ads ──
    '[class*="popup-ad"]',
    '[class*="popunder"]',
    '[class*="interstitial-ad"]',
    '[id*="interstitial-ad"]',

    // ── Fake notification hijack banners & spam bars ──
    '[class*="push-notification"]',
    '[id*="push-notification"]',
    '[class*="browser-notification"]',
    '[class*="web-notification"]',
    '[class*="notification-ad"]',
    '[id*="notification-ad"]',
    '[class*="notif-bar"]',
    '[id*="notif-bar"]',

    // ── Adsterra / Social Bar signatures ──
    'iframe[id^="container-"]',
    '[style*="--rdata"]',
    '[id^="social-bar"]',
    '[class*="social-bar"]',

    // ── Anti-Adblock blocking banners ──
    '[class*="adblock-overlay"]',
    '[id*="adblock-overlay"]',
    '[class*="adblock-modal"]',
    '[id*="adblock-modal"]',
    '[class*="block-adblock"]'
  ];
})();
