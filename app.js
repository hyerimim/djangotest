(() => {
  "use strict";

  const CONFIG = window.BARAMGIL_CONFIG || {};
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const SVG_NS = "http://www.w3.org/2000/svg";
  const PLACEHOLDERS = new Set(["", "YOUR_NCP_MAP_KEY_ID", "YOUR_GOOGLE_APPS_SCRIPT_EXEC_URL"]);
  const STORAGE = { routes: "baramgil:saved-routes:v1", reports: "baramgil:demo-reports:v1" };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

  const places = [
    { name: "제주국제공항", aliases: ["제주공항", "공항"], lat: 33.5104, lng: 126.4914, x: 278, y: 254 },
    { name: "제주시청", aliases: ["시청", "제주시청사"], lat: 33.4996, lng: 126.5312, x: 326, y: 275 },
    { name: "함덕해수욕장", aliases: ["함덕", "함덕해변"], lat: 33.5432, lng: 126.6696, x: 625, y: 220 },
    { name: "월정리해변", aliases: ["월정리", "월정리해수욕장"], lat: 33.5565, lng: 126.7958, x: 712, y: 213 },
    { name: "성산일출봉", aliases: ["성산", "일출봉"], lat: 33.4581, lng: 126.9425, x: 802, y: 296 },
    { name: "표선해수욕장", aliases: ["표선", "표선해변"], lat: 33.3251, lng: 126.843, x: 759, y: 432 },
    { name: "서귀포시청", aliases: ["서귀포", "서귀포시청사"], lat: 33.2533, lng: 126.56, x: 576, y: 504 },
    { name: "중문관광단지", aliases: ["중문", "중문단지"], lat: 33.2508, lng: 126.4122, x: 414, y: 500 },
    { name: "협재해수욕장", aliases: ["협재", "협재해변"], lat: 33.394, lng: 126.239, x: 244, y: 413 },
    { name: "애월한담해안산책로", aliases: ["애월", "한담해변", "애월해안도로"], lat: 33.4628, lng: 126.31, x: 220, y: 342 },
    { name: "새별오름", aliases: ["새별", "새별오름주차장"], lat: 33.3663, lng: 126.3576, x: 370, y: 386 },
    { name: "산굼부리", aliases: ["산굼부리분화구"], lat: 33.4326, lng: 126.6931, x: 624, y: 330 },
    { name: "성판악 탐방로", aliases: ["성판악", "성판악주차장"], lat: 33.3849, lng: 126.6204, x: 555, y: 385 },
    { name: "제주돌문화공원", aliases: ["돌문화공원"], lat: 33.4485, lng: 126.6594, x: 602, y: 315 },
  ];

  const routeTypes = [
    { id: "sheltered", title: "바람 최소 경로", badge: "바람 추천", badgeClass: "route-badge--wind", factor: 1.17, speed: 43, baseExposure: 14, windFactor: .9, shelter: 72, risk: "low", offset: .18, description: "방풍림·마을·중산간 지형을 우선해 강한 측풍 구간을 줄여요.", footer: "체감 바람을 가장 적게 받는 길" },
    { id: "balanced", title: "거리·바람 균형 경로", badge: "균형", badgeClass: "route-badge--demo", factor: 1.08, speed: 46, baseExposure: 23, windFactor: 1.35, shelter: 54, risk: "medium", offset: .09, description: "우회는 줄이면서 바람 노출이 큰 해안 구간을 적당히 피해요.", footer: "시간과 편안함의 균형" },
    { id: "fastest", title: "가장 빠른 경로", badge: "빠른 길", badgeClass: "route-badge--fast", factor: 1, speed: 50, baseExposure: 35, windFactor: 1.8, shelter: 31, risk: "high", offset: -.025, description: "도착 시간은 가장 짧지만 해안·개활지의 강한 횡풍을 더 받을 수 있어요.", footer: "도착 시간을 우선한 길" },
  ];

  const state = {
    start: places[0], goal: places[2], selected: "sheltered", routes: [], windLayer: true, mapType: "normal",
    wind: { direction: "북서풍", degree: 315, speed: 7.2, gust: 12.8, updatedAt: null },
    apiConnected: false, naverMap: null, naverOverlays: [], sheetState: "default", infoAction: null,
  };

  const refs = {
    mapStage: $(".map-stage"), routePanel: $("#routePanel"), routeLayer: $("#demoRouteLayer"), markerLayer: $("#demoMarkerLayer"), zoneLayer: $("#demoZoneLayer"), windArrows: $("#demoWindArrows"),
    start: $("#startInput"), goal: $("#goalInput"), routeList: $("#routeList"), quickList: $("#quickPlaceList"), datalist: $("#placeSuggestions"),
    loading: $("#loadingLayer"), loadingText: $("#loadingText"), toast: $("#toastRegion"),
    report: $("#reportModal"), reportForm: $("#reportForm"), reportComment: $("#reportComment"), reportCount: $("#reportCharCount"),
    info: $("#infoModal"), infoEyebrow: $("#infoModalEyebrow"), infoTitle: $("#infoModalTitle"), infoContent: $("#infoModalContent"), infoConfirm: $("#confirmInfoButton"),
  };

  function normalize(value) { return String(value || "").trim().toLowerCase().replace(/[\s·._-]+/g, ""); }
  function hash(value) { return [...String(value)].reduce((acc, char) => ((acc * 31 + char.charCodeAt(0)) >>> 0), 2166136261); }
  function resolvePlace(value, fallback) {
    const raw = String(value || "").trim();
    const key = normalize(raw);
    const found = places.find((place) => normalize(place.name) === key || place.aliases.some((alias) => normalize(alias) === key));
    if (found) return found;
    if (!raw) return fallback;
    const seed = hash(raw), x = 250 + seed % 470, y = 240 + (seed >>> 8) % 235;
    return { name: raw, aliases: [], x, y, lat: 33.22 + ((540 - y) / 390) * .36, lng: 126.2 + ((x - 190) / 675) * .78, custom: true };
  }
  function haversine(a, b) {
    const rad = (d) => d * Math.PI / 180, R = 6371, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function duration(minutes) { const m = Math.max(3, Math.round(minutes)); return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간 ${m % 60}분`; }
  function calculateRoutes() {
    const road = Math.max(2.4, haversine(state.start, state.goal)) * 1.16;
    state.routes = routeTypes.map((type, index) => {
      const distance = road * type.factor, minutes = distance / type.speed * 60 + 3 + index * 1.2;
      return { ...type, distance: Number(distance.toFixed(1)), duration: duration(minutes), exposure: clamp(Math.round(type.baseExposure + state.wind.speed * type.windFactor), 8, 82) };
    });
  }

  function svg(tag, attrs = {}) { const element = document.createElementNS(SVG_NS, tag); Object.entries(attrs).forEach(([k, v]) => element.setAttribute(k, String(v))); return element; }
  function routePath(route) {
    const a = state.start, b = state.goal, dx = b.x - a.x, dy = b.y - a.y, len = Math.max(1, Math.hypot(dx, dy));
    const px = -dy / len, py = dx / len, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const sign = ((510 - mid.x) * px + (360 - mid.y) * py) >= 0 ? 1 : -1;
    const offset = route.offset * Math.min(len, 430) * sign, bias = route.id === "sheltered" ? 16 * sign : route.id === "balanced" ? 8 * sign : 0;
    return `M ${a.x} ${a.y} C ${(a.x + dx * .32 + px * (offset + bias)).toFixed(1)} ${(a.y + dy * .32 + py * (offset + bias)).toFixed(1)}, ${(a.x + dx * .69 + px * (offset * .82 + bias)).toFixed(1)} ${(a.y + dy * .69 + py * (offset * .82 + bias)).toFixed(1)}, ${b.x} ${b.y}`;
  }
  function renderZones() {
    refs.zoneLayer.replaceChildren();
    [
      { x: 698, y: 238, rx: 72, ry: 43, color: "#E06756", fill: "#F18A74", label: "동부 해안 강풍" },
      { x: 303, y: 340, rx: 58, ry: 38, color: "#D99538", fill: "#F2B35B", label: "애월 횡풍" },
      { x: 552, y: 362, rx: 78, ry: 48, color: "#49A985", fill: "#75C9A8", label: "중산간 방풍" },
    ].forEach((zone) => {
      const e = svg("ellipse", { cx: zone.x, cy: zone.y, rx: zone.rx, ry: zone.ry, fill: zone.fill, "fill-opacity": .18, stroke: zone.color, "stroke-opacity": .62, "stroke-width": 2, "stroke-dasharray": "6 6" });
      const title = svg("title"); title.textContent = zone.label; e.appendChild(title); refs.zoneLayer.appendChild(e);
    });
  }
  function marker(place, goal = false) {
    const group = svg("g", { transform: `translate(${place.x} ${place.y})` });
    group.appendChild(svg("ellipse", { cx: 0, cy: 16, rx: 10, ry: 4, fill: "#183B56", "fill-opacity": .18 }));
    group.appendChild(svg("path", { d: "M0-18c-10.5 0-18 7.5-18 17.1C-18 11.2 0 26 0 26S18 11.2 18-.9C18-10.5 10.5-18 0-18Z", fill: goal ? "#F0A449" : "#258FC3", stroke: "#fff", "stroke-width": 4 }));
    group.appendChild(svg("circle", { cx: 0, cy: -2, r: 5.2, fill: "#fff" }));
    const label = `${goal ? "도착" : "출발"} · ${place.name}`, width = clamp(label.length * 8 + 25, 82, 150), labelGroup = svg("g", { transform: "translate(0 -31)" });
    labelGroup.appendChild(svg("rect", { x: -width / 2, y: -17, width, height: 27, rx: 10, fill: "#fff", "fill-opacity": .95, stroke: "#DDE7EA" }));
    const text = svg("text", { x: 0, y: 1, "text-anchor": "middle", fill: "#274B60", "font-size": 11, "font-weight": 800, "font-family": "Pretendard, sans-serif" }); text.textContent = label; labelGroup.appendChild(text); group.appendChild(labelGroup);
    return group;
  }
  function renderMap() {
    refs.routeLayer.replaceChildren();
    [...state.routes].sort((a, b) => (a.id === state.selected ? 1 : b.id === state.selected ? -1 : 0)).forEach((route) => {
      const selected = route.id === state.selected, d = routePath(route);
      refs.routeLayer.appendChild(svg("path", { d, stroke: "#fff", "stroke-width": selected ? 12 : 8, "stroke-opacity": selected ? .98 : .74 }));
      const line = svg("path", { d, stroke: selected ? "#258FC3" : route.id === "balanced" ? "#6B9BAB" : "#A6B3BA", "stroke-width": selected ? 7 : 4, "stroke-opacity": selected ? 1 : .74, "stroke-dasharray": !selected && route.id === "fastest" ? "8 7" : "0", class: selected ? "selected-route-line" : "comparison-route-line" });
      const title = svg("title"); title.textContent = `${route.title} · ${route.duration}`; line.appendChild(title); refs.routeLayer.appendChild(line);
    });
    refs.markerLayer.replaceChildren(marker(state.start), marker(state.goal, true));
    renderNaver();
  }
  function renderCards() {
    refs.routeList.innerHTML = state.routes.map((route) => {
      const selected = route.id === state.selected;
      return `<article class="route-card${selected ? " is-selected" : ""}" data-route-id="${route.id}" data-risk="${route.risk}"><button class="route-card__button" type="button" aria-pressed="${selected}"><div class="route-card__top"><div class="route-card__title-wrap"><div class="route-card__badge-row"><span class="route-badge ${route.badgeClass}">${route.badge}</span>${selected ? '<span class="route-badge">현재 선택</span>' : ""}</div><h3>${route.title}</h3></div><span class="route-card__check"><svg class="icon"><use href="#icon-check"></use></svg></span></div><div class="route-card__metrics"><strong class="route-card__time">${route.duration}</strong><span class="route-card__distance">${route.distance.toFixed(1)}km</span></div><p class="route-card__description">${route.description}</p><div class="route-card__exposure"><span>바람 노출</span><span class="exposure-track"><i style="width:${route.exposure}%"></i></span><strong>${route.exposure}%</strong></div><div class="route-card__footer"><span><svg class="icon"><use href="#icon-shield"></use></svg>방풍 구간 ${route.shelter}%</span><span>${route.footer}<svg class="icon"><use href="#icon-chevron"></use></svg></span></div></button></article>`;
    }).join("");
    $$(".route-card", refs.routeList).forEach((card) => card.addEventListener("click", () => { state.selected = card.dataset.routeId; renderCards(); renderMap(); toast(`${state.routes.find((r) => r.id === state.selected).title}로 선택했어요.`, "success"); }));
  }
  function renderRoutes() { calculateRoutes(); renderCards(); renderMap(); }

  function renderPlaces() {
    refs.datalist.innerHTML = places.map((p) => `<option value="${escapeHtml(p.name)}"></option>`).join("");
    if (refs.quickList) {
      refs.quickList.innerHTML = "";
    }
  }
  function toast(message, type = "info", durationMs = 2400) {
    const el = document.createElement("div"), icon = type === "warning" ? "icon-warning" : type === "success" ? "icon-check" : "icon-wind";
    el.className = `toast toast--${type}`; el.innerHTML = `<svg class="icon"><use href="#${icon}"></use></svg><span>${escapeHtml(message)}</span>`; refs.toast.appendChild(el);
    setTimeout(() => { el.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(-7px)" }], { duration: 180, fill: "forwards" }).finished.finally(() => el.remove()); }, durationMs);
  }
  function setLoading(show, text = "바람을 피해 경로를 비교하는 중…") { refs.loadingText.textContent = text; refs.loading.hidden = !show; }
  function apiUrl() { const value = String(CONFIG.API_BASE_URL || "").trim(); return PLACEHOLDERS.has(value) ? "" : value; }
  function degree(direction) { const entries = [["북서",315],["남서",225],["남동",135],["북동",45],["북",0],["동",90],["남",180],["서",270]]; return entries.find(([k]) => String(direction).includes(k))?.[1] ?? 315; }
  function updateWind() {
    const w = state.wind, speed = Number(w.speed), level = speed < 4 ? "잔잔" : speed < 8 ? "강함" : speed < 12 ? "매우 강함" : "위험", badge = $("#windLevelBadge");
    const mapWindText = $("#mapWindText"); const mapWindUpdated = $("#mapWindUpdated"); const windSummaryText = $("#windSummaryText"); const windUpdatedText = $("#windUpdatedText"); const windMeterFill = $("#windMeterFill"); const windArrowPath = $("#windArrowPath"); const windNoticeText = $("#windNoticeText");
    if (mapWindText) mapWindText.textContent = `${w.direction} ${speed.toFixed(1)}m/s`;
    if (windSummaryText) windSummaryText.textContent = `${w.direction} ${speed.toFixed(1)}m/s`;
    if (mapWindUpdated) mapWindUpdated.textContent = state.apiConnected ? "바람 정보 기준" : "바람 정보 기준";
    if (windUpdatedText) windUpdatedText.textContent = `업데이트: ${w.updatedAt ? new Date(w.updatedAt).toLocaleString("ko-KR") : "최신 정보 기준"}`;
    if (windMeterFill) windMeterFill.style.width = `${clamp(speed / 15 * 100, 8, 100)}%`;
    if (windArrowPath) windArrowPath.style.transform = `rotate(${Number(w.degree ?? degree(w.direction)) + 180}deg)`;
    if (badge) {
      badge.textContent = level; badge.classList.toggle("is-low", speed < 4); badge.classList.toggle("is-high", speed >= 8);
    }
    if (windNoticeText) windNoticeText.textContent = speed >= 9 ? "해안과 오름 정상은 돌풍이 강할 수 있어 중산간·마을 경로를 우선 비교해요." : speed >= 5 ? "해안도로보다 도심·중산간 도로를 우선 비교하고 있어요." : "바람이 비교적 잔잔해 거리와 풍경을 함께 고려해도 좋아요.";
    renderRoutes();
  }
  async function loadSheets() {
    const url = apiUrl(); if (!url) return updateWind();
    try {
      const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}action=bootstrap&_=${Date.now()}`, { cache: "no-store" }); if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json(), current = data.currentWind || data.current || data.data?.[0]; if (data.ok === false || data.error) throw new Error(data.error || "API 오류");
      if (current) { const direction = current.direction || current.windDirection || state.wind.direction; state.wind = { direction, degree: Number(current.directionDeg ?? current.degree ?? degree(direction)), speed: Number(current.speed ?? current.windSpeed ?? 7.2), gust: Number(current.gust ?? 12.8), updatedAt: current.updatedAt || current.timestamp || data.updatedAt }; }
      state.apiConnected = true; updateWind(); toast("바람 데이터를 불러왔어요.", "success");
    } catch (error) { console.error(error); state.apiConnected = false; updateWind(); toast("바람 데이터를 확인해 주세요. 기본 정보로 표시해요.", "warning", 3200); }
  }

  function openInfo(eyebrow, title, html, label = "확인", action = null) { refs.infoEyebrow.textContent = eyebrow; refs.infoTitle.textContent = title; refs.infoContent.innerHTML = html; refs.infoConfirm.textContent = label; state.infoAction = action; refs.info.showModal(); }
  function closeInfo() { if (refs.info.open) refs.info.close(); state.infoAction = null; refs.infoConfirm.textContent = "확인"; }
  function safeRead(key, fallback = []) { try { const value = JSON.parse(localStorage.getItem(key) || "null"); return value ?? fallback; } catch { return fallback; } }
  function safeWrite(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
  function selectedRoute() { return state.routes.find((route) => route.id === state.selected) || state.routes[0]; }
  function saveRoute() {
    const route = selectedRoute(), saved = safeRead(STORAGE.routes, []), id = `${normalize(state.start.name)}-${normalize(state.goal.name)}-${route.id}`;
    const item = { id, start: state.start.name, goal: state.goal.name, routeId: route.id, title: route.title, duration: route.duration, distance: route.distance, savedAt: new Date().toISOString() };
    const ok = safeWrite(STORAGE.routes, [item, ...saved.filter((x) => x.id !== id)].slice(0, 20)); toast(ok ? "현재 경로를 저장했어요." : "브라우저 저장소를 사용할 수 없어요.", ok ? "success" : "warning");
  }
  function showSaved() {
    const saved = safeRead(STORAGE.routes, []), html = saved.length ? `<div class="saved-route-list">${saved.map((item) => `<button class="saved-route-row" type="button" data-id="${escapeHtml(item.id)}"><span><strong>${escapeHtml(item.start)} → ${escapeHtml(item.goal)}</strong><small>${escapeHtml(item.title)} · ${escapeHtml(item.duration)} · ${Number(item.distance).toFixed(1)}km</small></span><svg class="icon"><use href="#icon-chevron"></use></svg></button>`).join("")}</div><p class="saved-route-note">저장 경로는 현재 브라우저에 보관됩니다.</p>` : "<p>아직 저장한 경로가 없어요. 아래 버튼으로 현재 경로를 저장해보세요.</p>";
    openInfo("MY ROUTES", "저장 경로", html, "현재 경로 저장", () => { saveRoute(); closeInfo(); });
    $$(".saved-route-row", refs.infoContent).forEach((button) => button.addEventListener("click", () => { const item = saved.find((x) => x.id === button.dataset.id); if (!item) return; refs.start.value = item.start; refs.goal.value = item.goal; state.start = resolvePlace(item.start, state.start); state.goal = resolvePlace(item.goal, state.goal); state.selected = item.routeId; renderRoutes(); closeInfo(); toast("저장한 경로를 불러왔어요.", "success"); }));
  }

  async function search(event) {
    event?.preventDefault(); const a = refs.start.value.trim(), b = refs.goal.value.trim();
    if (!a || !b) return toast("출발지와 도착지를 모두 입력해주세요.", "warning"); if (normalize(a) === normalize(b)) return toast("출발지와 도착지는 서로 달라야 해요.", "warning");
    setLoading(true); await wait(520); state.start = resolvePlace(a, state.start); state.goal = resolvePlace(b, state.goal); refs.start.value = state.start.name; refs.goal.value = state.goal.name; state.selected = "sheltered"; renderRoutes(); setLoading(false); toast(`${state.start.name}에서 ${state.goal.name}까지 3개 경로를 비교했어요.`, "success", 3000);
  }
  function swap() { [refs.start.value, refs.goal.value] = [refs.goal.value, refs.start.value]; [state.start, state.goal] = [state.goal, state.start]; renderRoutes(); toast("출발지와 도착지를 바꿨어요."); }
  function toggleWind() { /* wind-layer toggle removed */ }
  function toggleMap() { state.mapType = state.mapType === "normal" ? "satellite" : "normal"; refs.mapStage.classList.toggle("is-satellite", state.mapType === "satellite"); if (state.naverMap && window.naver?.maps) state.naverMap.setMapTypeId(state.mapType === "satellite" ? naver.maps.MapTypeId.SATELLITE : naver.maps.MapTypeId.NORMAL); toast(state.mapType === "satellite" ? "위성 지도 느낌으로 바꿨어요." : "일반 지도 느낌으로 바꿨어요."); }
  function toggleRoutePanel(force = null) {
    const shouldHide = force ?? !refs.routePanel.classList.contains("is-hidden");
    refs.routePanel.classList.toggle("is-hidden", shouldHide);
    refs.mapStage.classList.toggle("is-panel-hidden", shouldHide);
    const launcher = $("#showRoutePanelButton");
    const toggle = $("#toggleRoutePanelButton");
    if (launcher) launcher.hidden = !shouldHide;
    if (toggle) toggle.hidden = shouldHide;
    refs.routePanel.setAttribute("aria-hidden", String(shouldHide));
  }
  function currentLocation({ start = false, report = false } = {}) {
    if (!navigator.geolocation) return toast("이 브라우저에서는 위치 기능을 사용할 수 없어요.", "warning"); toast("현재 위치를 확인하고 있어요.");
    navigator.geolocation.getCurrentPosition(({ coords }) => { const x = clamp(190 + (coords.longitude - 126.15) / .85 * 675, 180, 875), y = clamp(540 - (coords.latitude - 33.18) / .4 * 390, 145, 548), place = { name: "현재 위치", aliases: [], lat: coords.latitude, lng: coords.longitude, x, y, custom: true }; if (start) { state.start = place; refs.start.value = "현재 위치"; renderRoutes(); } if (report) { $("#reportLat").value = coords.latitude.toFixed(6); $("#reportLng").value = coords.longitude.toFixed(6); $("#reportLocationText").value = `현재 위치 (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`; } if (state.naverMap) state.naverMap.panTo(new naver.maps.LatLng(coords.latitude, coords.longitude)); toast("현재 위치를 반영했어요.", "success"); }, () => toast("위치 권한을 허용해주세요.", "warning"), { enableHighAccuracy: true, timeout: 8000 });
  }
  async function share() { const route = selectedRoute(), text = `바람길 제주: ${state.start.name} → ${state.goal.name}, ${route.title} ${route.duration} (${route.distance.toFixed(1)}km), 바람 노출 ${route.exposure}%`; try { if (navigator.share) await navigator.share({ title: "바람길 제주 경로", text }); else { await navigator.clipboard.writeText(text); toast("경로 요약을 복사했어요.", "success"); } } catch (error) { if (error.name !== "AbortError") toast("공유하지 못했어요.", "warning"); } }

  function openReport() { $("#reportLocationText").value = `${state.start.name}–${state.goal.name} 경로 주변`; $("#reportLat").value = ((state.start.lat + state.goal.lat) / 2).toFixed(6); $("#reportLng").value = ((state.start.lng + state.goal.lng) / 2).toFixed(6); refs.reportComment.value = ""; refs.reportCount.textContent = "0"; refs.report.showModal(); }
  async function submitReport(event) {
    event.preventDefault(); const data = new FormData(refs.reportForm); if (data.get("website")) return;
    const payload = { action: "report", severity: Number(data.get("severity") || 3), locationText: String(data.get("locationText") || "").trim(), comment: String(data.get("comment") || "").trim(), lat: Number(data.get("lat") || 0), lng: Number(data.get("lng") || 0), userAgent: navigator.userAgent.slice(0, 180), createdAt: new Date().toISOString() }; if (!payload.locationText) return toast("신고 위치를 입력해주세요.", "warning");
    const button = $("#submitReportButton"); button.disabled = true; button.textContent = "저장 중…";
    try { const url = apiUrl(); if (url) { const response = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); const result = await response.json(); if (result.ok === false || result.error) throw new Error(result.error || "저장 실패"); } else { const reports = safeRead(STORAGE.reports, []); safeWrite(STORAGE.reports, [payload, ...reports].slice(0, 30)); await wait(350); } refs.report.close(); toast(url ? "신고가 완료됐어요." : "신고를 완료했어요", "success", 3200); } catch (error) { console.error(error); toast("신고에 실패했어요.", "warning", 3300); } finally { button.disabled = false; button.textContent = "신고"; }
  }

  function sheetCycle() { if (!matchMedia("(max-width: 860px)").matches) return; state.sheetState = state.sheetState === "default" ? "expanded" : state.sheetState === "expanded" ? "collapsed" : "default"; refs.routePanel.classList.toggle("is-expanded", state.sheetState === "expanded"); refs.routePanel.classList.toggle("is-collapsed", state.sheetState === "collapsed"); }

  function naverKey() { const key = String(CONFIG.NAVER_MAP_KEY_ID || "").trim(); return CONFIG.DEMO_MODE === false && !PLACEHOLDERS.has(key) ? key : ""; }
  function loadScript(src) { return new Promise((resolve, reject) => { const script = document.createElement("script"); script.src = src; script.async = true; script.onload = resolve; script.onerror = reject; document.head.appendChild(script); }); }
  async function initNaver() {
    const key = naverKey(); if (!key) return;
    try { await loadScript(`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(key)}`); if (!window.naver?.maps) throw new Error("NAVER Maps 로드 실패"); state.naverMap = new naver.maps.Map("map", { center: new naver.maps.LatLng(33.4108, 126.5607), zoom: 10, minZoom: 8, maxZoom: 18, zoomControl: true, zoomControlOptions: { position: naver.maps.Position.RIGHT_CENTER }, mapTypeControl: false }); refs.mapStage.classList.add("is-live"); $("#demoAttribution").textContent = "NAVER Maps · 바람길 제주 오버레이"; renderNaver(); toast("NAVER 지도를 연결했어요.", "success"); } catch (error) { console.error(error); toast("NAVER 지도 키 연결에 실패해 디자인 지도로 표시해요.", "warning", 3200); }
  }
  function clearNaver() { state.naverOverlays.forEach((overlay) => overlay.setMap?.(null)); state.naverOverlays = []; }
  function naverPath(route) { const a = state.start, b = state.goal, dx = b.lng - a.lng, dy = b.lat - a.lat, len = Math.max(.001, Math.hypot(dx, dy)), px = -dy / len, py = dx / len, offset = route.offset * Math.min(len, .32); return [0,.18,.38,.58,.78,1].map((t) => { const curve = Math.sin(Math.PI * t) * offset; return new naver.maps.LatLng(a.lat + dy * t + py * curve, a.lng + dx * t + px * curve); }); }
  function renderNaver() {
    if (!state.naverMap || !window.naver?.maps || !state.routes.length) return; clearNaver();
    state.routes.forEach((route) => { const selected = route.id === state.selected, path = naverPath(route); if (selected) state.naverOverlays.push(new naver.maps.Polyline({ map: state.naverMap, path, strokeColor: "#fff", strokeOpacity: .96, strokeWeight: 11 })); state.naverOverlays.push(new naver.maps.Polyline({ map: state.naverMap, path, strokeColor: selected ? "#258FC3" : route.id === "balanced" ? "#6B9BAB" : "#9CAAB1", strokeOpacity: selected ? 1 : .68, strokeWeight: selected ? 6 : 4, strokeStyle: !selected && route.id === "fastest" ? "shortdash" : "solid", zIndex: selected ? 50 : 20 })); });
    const markerHtml = (label, goal) => `<div class="naver-custom-marker${goal ? " naver-custom-marker--goal" : ""}"><span>${label}</span></div>`;
    state.naverOverlays.push(new naver.maps.Marker({ map: state.naverMap, position: new naver.maps.LatLng(state.start.lat, state.start.lng), icon: { content: markerHtml("출", false), anchor: new naver.maps.Point(15, 30) }, title: state.start.name })); state.naverOverlays.push(new naver.maps.Marker({ map: state.naverMap, position: new naver.maps.LatLng(state.goal.lat, state.goal.lng), icon: { content: markerHtml("도", true), anchor: new naver.maps.Point(15, 30) }, title: state.goal.name }));
    if (state.windLayer) [{lat:33.54,lng:126.76,r:6000,c:"#E06756"},{lat:33.45,lng:126.39,r:4500,c:"#D99538"},{lat:33.39,lng:126.62,r:5500,c:"#49A985"}].forEach((z) => state.naverOverlays.push(new naver.maps.Circle({ map: state.naverMap, center: new naver.maps.LatLng(z.lat,z.lng), radius:z.r, strokeColor:z.c, strokeOpacity:.55, strokeWeight:2, fillColor:z.c, fillOpacity:.12 })));
  }

  function bind() {
    $("#routeForm").addEventListener("submit", search); $("#swapRouteButton").addEventListener("click", swap); $("#clearGoalButton").addEventListener("click", () => { refs.goal.value = ""; refs.goal.focus(); }); $("#useCurrentStartButton").addEventListener("click", () => currentLocation({ start: true })); $("#currentLocationButton").addEventListener("click", () => currentLocation());
    const windLayerButton = $("#windLayerButton"); if (windLayerButton) windLayerButton.addEventListener("click", toggleWind); $("#mapTypeButton").addEventListener("click", toggleMap); $("#shareButton").addEventListener("click", share); $("#savedRouteButton").addEventListener("click", showSaved); $("#openReportButton").addEventListener("click", openReport); $("#mobileSheetHandle").addEventListener("click", sheetCycle); $("#toggleRoutePanelButton").addEventListener("click", () => toggleRoutePanel(true)); $("#showRoutePanelButton").addEventListener("click", () => toggleRoutePanel(false));
    $("#closeReportButton").addEventListener("click", () => refs.report.close()); $("#cancelReportButton").addEventListener("click", () => refs.report.close()); $("#reportCurrentLocationButton").addEventListener("click", () => currentLocation({ report: true })); refs.reportForm.addEventListener("submit", submitReport); refs.reportComment.addEventListener("input", () => refs.reportCount.textContent = refs.reportComment.value.length);
    $("#windInfoButton").addEventListener("click", () => openInfo("HOW IT WORKS", "바람 회피 점수 계산", "<h3>풍향과 도로 방향 비교</h3><p>주행 방향과 바람 방향이 직각에 가까울수록 횡풍 노출 점수를 높게 계산합니다.</p><h3>방풍 지형 가중치</h3><p>방풍림, 마을, 곶자왈, 중산간처럼 바람을 줄여주는 구간에는 감점 보정을 적용합니다.</p><h3>경로 비교</h3><p>거리·시간·바람 노출을 함께 비교해 바람 최소, 균형, 빠른 길을 보여줍니다.</p><p>현재 경로는 UI 검증용 시뮬레이션이며 실제 배포에서는 도로 경로 API 좌표를 사용하세요.</p>"));
    $("#privacyButton").addEventListener("click", () => openInfo("PRIVACY", "개인정보 안내", "<h3>위치 정보</h3><p>현재 위치는 사용자가 버튼을 누르고 권한을 허용한 경우에만 사용합니다.</p><h3>바람 신고</h3><p>Apps Script URL이 연결된 경우 위치, 체감 세기, 메모가 지정한 Google Sheets에 저장됩니다.</p><h3>저장 경로</h3><p>저장 경로는 이 브라우저에만 보관됩니다.</p>"));
    $("#dataGuideButton").addEventListener("click", () => openInfo("GOOGLE SHEETS", "데이터 연결 방법", "<ol><li>Google Sheets에서 Apps Script를 엽니다.</li><li><code>google-apps-script.gs</code>를 붙여넣고 <code>setupSheets()</code>를 실행합니다.</li><li>웹 앱으로 배포합니다.</li><li><code>config.js</code>의 <code>API_BASE_URL</code>에 /exec URL을 넣습니다.</li></ol><p>NAVER 지도는 <code>NAVER_MAP_KEY_ID</code>를 설정하고 <code>DEMO_MODE</code>를 false로 변경하세요.</p>"));
    $("#closeInfoButton").addEventListener("click", closeInfo); refs.infoConfirm.addEventListener("click", () => typeof state.infoAction === "function" ? state.infoAction() : closeInfo());
    [refs.info, refs.report].forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
    window.addEventListener("resize", () => { if (!matchMedia("(max-width: 860px)").matches) { state.sheetState = "default"; refs.routePanel.classList.remove("is-expanded", "is-collapsed"); } });
  }

  async function init() {
    renderPlaces();
    renderZones();
    bind();
    refs.routePanel.classList.add("is-hidden");
    refs.mapStage.classList.add("is-panel-hidden");
    const launcher = $("#showRoutePanelButton");
    const toggle = $("#toggleRoutePanelButton");
    if (launcher) launcher.hidden = false;
    if (toggle) toggle.hidden = true;
    refs.routePanel.setAttribute("aria-hidden", "true");
    toggleRoutePanel(true);
    updateWind();
    await Promise.allSettled([loadSheets(), initNaver()]);
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  init();
})();
