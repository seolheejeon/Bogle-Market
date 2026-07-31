// 보글마켓 서비스워커 — 오프라인 폴백 + 웹 푸시 수신을 담당한다.
// 캐싱 범위를 일부러 최소로 둔다: Supabase에서 오는 상품/주문 데이터는 항상
// 최신이어야 해서 캐시하지 않고, 오프라인일 때 "완전히 빈 화면" 대신
// offline.html만 보여주는 것이 목표다.
const CACHE_VERSION = "v1";
const CACHE_NAME = `bogle-market-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 페이지 이동(navigation) 요청만 오프라인 폴백 대상으로 삼는다 — API/이미지 등
// 그 외 요청은 그냥 실패하게 두고(각 화면이 이미 로딩/에러 상태를 처리함)
// 잘못된 캐시로 인한 오래된 데이터 노출을 막는다.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL).then((res) => res ?? Response.error())),
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "보글마켓", body: event.data.text() };
  }
  const title = payload.title ?? "보글마켓";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? "",
      icon: payload.icon ?? "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.tag,
      data: { url: payload.url ?? "/" },
    }),
  );
});

// 알림을 누르면 이미 열려있는 탭이 있으면 그 탭을 해당 경로로 옮기고
// 포커스하고, 없으면 새 탭을 연다.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
