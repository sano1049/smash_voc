/* Smash VOC LP：計測・ヘッダー・カルーセル・FAQ
   体験デモ本体は script.js。こちらは先に読み込む。 */
(function () {
  "use strict";

  // サンプルシナリオ（実際のSmash VOC）のURL。決まったらここに入れる。
  // 空のあいだは、ページ内の簡易デモをサンプル店舗で動かす。
  var SAMPLE_SCENARIO_URL = "";

  var SIGNUP_URL = "https://smash.buzz/sign-up";

  // ---- 計測（GTMのdataLayerへ送る） ----
  window.dataLayer = window.dataLayer || [];
  window.vocTrack = function (event, params) {
    var data = { event: event };
    for (var k in params || {}) data[k] = params[k];
    window.dataLayer.push(data);
  };

  // 広告のパラメータ（utm_*, fbclid など）を申込ページへ引き継ぐ
  function signupUrl() {
    var q = window.location.search.replace(/^\?/, "");
    return q ? SIGNUP_URL + "?" + q : SIGNUP_URL;
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("a") : null;
    if (!a) return;
    var loc = a.getAttribute("data-loc") || "";

    if (a.classList.contains("js-signup")) {
      a.href = signupUrl();
      window.vocTrack("voc_signup_click", { cta_location: loc });
    } else if (a.classList.contains("js-try")) {
      window.vocTrack("voc_try_click", { cta_location: loc });
      closeMenu();
    } else if (a.classList.contains("js-sample")) {
      window.vocTrack("voc_sample_click");
      if (SAMPLE_SCENARIO_URL) {
        e.preventDefault();
        window.open(SAMPLE_SCENARIO_URL, "_blank", "noopener");
      } else if (typeof initChat === "function" && typeof DUMMY_STORES !== "undefined") {
        e.preventDefault();
        if (typeof resetDemo === "function") resetDemo();
        window.vocTrack("voc_demo_start", { demo_type: "sample" });
        initChat(Object.assign({}, DUMMY_STORES[0]));
      }
    } else if (a.classList.contains("js-contact")) {
      window.vocTrack("voc_contact_click", { cta_location: loc });
    } else if (a.classList.contains("js-ebook")) {
      window.vocTrack("voc_ebook_click");
    }
  });

  // ---- スマホメニュー ----
  var burger = document.querySelector(".hd__burger");
  var menu = document.getElementById("spmenu");
  function closeMenu() {
    if (!burger || !menu) return;
    menu.hidden = true;
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-label", "メニューを開く");
  }
  if (burger && menu) {
    burger.addEventListener("click", function () {
      var open = burger.getAttribute("aria-expanded") === "true";
      if (open) return closeMenu();
      menu.hidden = false;
      burger.setAttribute("aria-expanded", "true");
      burger.setAttribute("aria-label", "メニューを閉じる");
    });
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) closeMenu();
    });
  }

  // ---- 活用シーン（スマホは横スワイプ） ----
  var list = document.getElementById("scenes-list");
  var dots = document.getElementById("scenes-dots");
  if (list) {
    var cards = Array.prototype.slice.call(list.children);
    var dotEls = cards.map(function () {
      var s = document.createElement("span");
      if (dots) dots.appendChild(s);
      return s;
    });
    var current = function () {
      var mid = list.scrollLeft + list.clientWidth / 2, best = 0, min = Infinity;
      cards.forEach(function (c, i) {
        var d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
        if (d < min) { min = d; best = i; }
      });
      return best;
    };
    var mark = function () {
      var n = current();
      cards.forEach(function (c, i) { c.classList.toggle("is-active", i === n); });
      dotEls.forEach(function (d, i) { d.classList.toggle("is-active", i === n); });
    };
    var go = function (dir) {
      var n = Math.max(0, Math.min(cards.length - 1, current() + dir));
      var c = cards[n];
      list.scrollTo({ left: c.offsetLeft - (list.clientWidth - c.offsetWidth) / 2, behavior: "smooth" });
    };
    var ticking = false;
    list.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { mark(); ticking = false; });
    }, { passive: true });
    var prev = document.querySelector(".scenes__btn--prev");
    var next = document.querySelector(".scenes__btn--next");
    if (prev) prev.addEventListener("click", function () { go(-1); });
    if (next) next.addEventListener("click", function () { go(1); });
    window.addEventListener("resize", mark);
    mark();
  }

  // ---- FAQ（スマホは3件＋「もっと見る」） ----
  var faqMore = document.getElementById("faq-more");
  var faqList = document.getElementById("faq-list");
  if (faqMore && faqList) {
    faqMore.addEventListener("click", function () {
      faqList.classList.add("is-open");
      faqMore.setAttribute("aria-expanded", "true");
    });
  }
})();
