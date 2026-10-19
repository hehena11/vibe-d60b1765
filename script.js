const API_BASE =
  "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";

const elements = {
  apiKey: document.getElementById("apiKey"),
  saveKeyBtn: document.getElementById("saveKeyBtn"),
  currentLocationBtn: document.getElementById("currentLocationBtn"),
  citySelect: document.getElementById("citySelect"),
  citySearchBtn: document.getElementById("citySearchBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  apiStatus: document.getElementById("apiStatus"),
  messageBox: document.getElementById("messageBox"),
  weatherSection: document.getElementById("weatherSection"),
  locationName: document.getElementById("locationName"),
  updatedTime: document.getElementById("updatedTime"),
  weatherIcon: document.getElementById("weatherIcon"),
  temperature: document.getElementById("temperature"),
  weatherSummary: document.getElementById("weatherSummary"),
  humidity: document.getElementById("humidity"),
  rainChance: document.getElementById("rainChance"),
  windSpeed: document.getElementById("windSpeed"),
  forecastDateLabel: document.getElementById("forecastDateLabel"),
  forecastList: document.getElementById("forecastList"),
};

let lastLocation = null;

function getSavedApiKey() {
  return localStorage.getItem("kmaWeatherApiKey") || "";
}

function setMessage(message, type = "info") {
  elements.messageBox.className = `message-box ${type}`;
  elements.messageBox.innerHTML = message;
}

function updateApiStatus() {
  const hasKey = Boolean(getSavedApiKey());
  elements.apiStatus.textContent = hasKey ? "API 키 저장됨" : "API 키를 입력해주세요";
  elements.apiStatus.classList.toggle("active", hasKey);
}

function saveApiKey() {
  const key = elements.apiKey.value.trim();

  if (!key) {
    setMessage("저장할 <strong>기상청 API 키</strong>를 먼저 입력해주세요.", "error");
    return;
  }

  localStorage.setItem("kmaWeatherApiKey", key);
  updateApiStatus();
  setMessage("API 키가 저장되었습니다. 이제 위치 또는 도시를 선택해 날씨를 조회해보세요.", "info");
}

function getKoreanDateParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const value = (type) => parts.find((part) => part.type === type)?.value;

  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

function formatYmd(year, month, day) {
  return `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

function getBaseDateTime() {
  const now = getKoreanDateParts();
  const baseHours = [2, 5, 8, 11, 14, 17, 20, 23];
  let selectedHour = -1;

  for (const hour of baseHours) {
    if (hour < now.hour || (hour === now.hour && now.minute >= 10)) {
      selectedHour = hour;
    }
  }

  if (selectedHour === -1) {
    const yesterday = new Date(Date.UTC(now.year, now.month - 1, now.day - 1));
    return {
      baseDate: formatYmd(
        yesterday.getUTCFullYear(),
        yesterday.getUTCMonth() + 1,
        yesterday.getUTCDate()
      ),
      baseTime: "2300",
    };
  }

  return {
    baseDate: formatYmd(now.year, now.month, now.day),
    baseTime: `${String(selectedHour).padStart(2, "0")}00`,
  };
}

function normalizeServiceKey(key) {
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

async function requestForecast(nx, ny) {
  const apiKey = getSavedApiKey();

  if (!apiKey) {
    throw new Error("기상청 단기예보 API 키를 먼저 입력하고 저장해주세요.");
  }

  const { baseDate, baseTime } = getBaseDateTime();
  const params = new URLSearchParams({
    serviceKey: normalizeServiceKey(apiKey),
    pageNo: "1",
    numOfRows: "1000",
    dataType: "JSON",
    base_date: baseDate,
    base_time: baseTime,
    nx: String(nx),
    ny: String(ny),
  });

  const response = await fetch(`${API_BASE}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`날씨 정보를 불러오지 못했습니다. (오류 코드: ${response.status})`);
  }

  const data = await response.json();
  const header = data?.response?.header;
  const items = data?.response?.body?.items?.item;

  if (header?.resultCode !== "00") {
    throw new Error(header?.resultMsg || "API 응답에 오류가 있습니다. API 키를 확인해주세요.");
  }

  if (!items || !items.length) {
    throw new Error("표시할 예보 데이터가 없습니다. 잠시 후 다시 시도해주세요.");
  }

  return { items, baseDate, baseTime };
}

function weatherInfo(sky, pty) {
  const precipitation = String(pty || "0");

  if (precipitation === "1") return { icon: "🌧️", text: "비" };
  if (precipitation === "2") return { icon: "🌨️", text: "비 또는 눈" };
  if (precipitation === "3") return { icon: "❄️", text: "눈" };
  if (precipitation === "4") return { icon: "🌦️", text: "소나기" };

  const skyCode = String(sky || "1");
  if (skyCode === "1") return { icon: "☀️", text: "맑음" };
  if (skyCode === "3") return { icon: "🌤️", text: "구름 많음" };
  return { icon: "☁️", text: "흐림" };
}

function groupForecastItems(items) {
  const groups = {};

  items.forEach((item) => {
    const key = `${item.fcstDate}${item.fcstTime}`;
    if (!groups[key]) {
      groups[key] = {
        date: item.fcstDate,
        time: item.fcstTime,
      };
    }
    groups[key][item.category] = item.fcstValue;
  });

  return Object.values(groups).sort((a, b) => {
    return `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`);
  });
}

function getNowKstNumber() {
  const now = getKoreanDateParts();
  return Number(`${formatYmd(now.year, now.month, now.day)}${String(now.hour).padStart(2, "0")}${String(now.minute).padStart(2, "0")}`);
}

function formatForecastTime(item) {
  const hour = Number(item.time.slice(0, 2));
  const meridiem = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 || 12;
  return `${meridiem} ${displayHour}시`;
}

function formatForecastDate(dateText) {
  return `${Number(dateText.slice(4, 6))}월 ${Number(dateText.slice(6, 8))}일`;
}

function renderWeather(items, locationName, baseDate, baseTime) {
  const groups = groupForecastItems(items);
  const nowNumber = getNowKstNumber();

  const current =
    groups.find((item) => Number(`${item.date}${item.time}`) >= nowNumber) ||
    groups[0];

  const info = weatherInfo(current.SKY, current.PTY);

  elements.locationName.textContent = locationName;
  elements.updatedTime.textContent = `기상청 ${formatForecastDate(baseDate)} ${baseTime.slice(0, 2)}시 발표 예보`;
  elements.weatherIcon.textContent = info.icon;
  elements.temperature.textContent = current.TMP ?? "--";
  elements.weatherSummary.textContent = `${info.text} · ${formatForecastTime(current)} 기준 예보`;
  elements.humidity.textContent = current.REH ? `${current.REH}%` : "--%";
  elements.rainChance.textContent = current.POP ? `${current.POP}%` : "--%";
  elements.windSpeed.textContent = current.WSD ? `${current.WSD} m/s` : "-- m/s";
  elements.forecastDateLabel.textContent = formatForecastDate(current.date);

  const visibleForecasts = groups
    .filter((item) => Number(`${item.date}${item.time}`) >= nowNumber)
    .slice(0, 8);

  const forecastItems = visibleForecasts.length ? visibleForecasts : groups.slice(0, 8);

  elements.forecastList.innerHTML = forecastItems
    .map((item, index) => {
      const weather = weatherInfo(item.SKY, item.PTY);
      const isNow = index === 0;

      return `
        <article class="forecast-item ${isNow ? "now" : ""}">
          <div class="forecast-time">${isNow ? "지금 예보" : formatForecastTime(item)}</div>
          <div class="forecast-icon">${weather.icon}</div>
          <div class="forecast-temp">${item.TMP ?? "--"}°</div>
          <div class="forecast-rain">강수 ${item.POP ?? "--"}%</div>
        </article>
      `;
    })
    .join("");

  elements.weatherSection.classList.remove("hidden");
}

async function loadWeather(location) {
  lastLocation = location;

  setMessage("기상청 단기예보 데이터를 불러오는 중입니다...", "loading");

  try {
    const { items, baseDate, baseTime } = await requestForecast(location.nx, location.ny);
    renderWeather(items, location.name, baseDate, baseTime);
    setMessage(
      `<strong>${location.name}</strong>의 날씨를 성공적으로 불러왔습니다. 필요할 때 새로고침 버튼을 눌러 다시 조회할 수 있어요.`,
      "info"
    );
  } catch (error) {
    elements.weatherSection.classList.add("hidden");
    setMessage(error.message, "error");
  }
}

function citySearch() {
  const [nx, ny, name] = elements.citySelect.value.split(",");
  loadWeather({ nx: Number(nx), ny: Number(ny), name });
}

function convertToGrid(lat, lon) {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;

  const degToRad = Math.PI / 180;
  const re = RE / GRID;
  const slat1 = SLAT1 * degToRad;
  const slat2 = SLAT2 * degToRad;
  const olon = OLON * degToRad;
  const olat = OLAT * degToRad;

  const sn =
    Math.log(Math.cos(slat1) / Math.cos(slat2)) /
    Math.log(Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5));
  const sf =
    (Math.pow(Math.tan(Math.PI * 0.25 + slat1 * 0.5), sn) * Math.cos(slat1)) / sn;
  const ro =
    (re * sf) / Math.pow(Math.tan(Math.PI * 0.25 + olat * 0.5), sn);

  let ra =
    (re * sf) / Math.pow(Math.tan(Math.PI * 0.25 + lat * degToRad * 0.5), sn);
  let theta = lon * degToRad - olon;

  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;

  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

function useCurrentLocation() {
  if (!getSavedApiKey()) {
    setMessage("먼저 발급받은 기상청 API 키를 입력하고 <strong>키 저장</strong>을 눌러주세요.", "error");
    return;
  }

  if (!navigator.geolocation) {
    setMessage("이 브라우저에서는 현재 위치 기능을 사용할 수 없습니다. 도시 선택으로 조회해주세요.", "error");
    return;
  }

  setMessage("현재 위치 정보를 확인하는 중입니다...", "loading");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      const grid = convertToGrid(latitude, longitude);

      loadWeather({
        ...grid,
        name: "내 현재 위치",
      });
    },
    () => {
      setMessage("위치 권한을 허용하지 못했습니다. 아래에서 도시를 선택해 조회해주세요.", "error");
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000,
    }
  );
}

elements.saveKeyBtn.addEventListener("click", saveApiKey);
elements.currentLocationBtn.addEventListener("click", useCurrentLocation);
elements.citySearchBtn.addEventListener("click", citySearch);

elements.refreshBtn.addEventListener("click", () => {
  if (lastLocation) {
    loadWeather(lastLocation);
  }
});

elements.apiKey.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    saveApiKey();
  }
});

window.addEventListener("DOMContentLoaded", () => {
  elements.apiKey.value = getSavedApiKey();
  updateApiStatus();
});