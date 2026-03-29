export const EDITOR_CANVAS_WIDTH = 720;
export const EDITOR_CANVAS_HEIGHT = 980;
export const EDITOR_GRID_SIZE = 8;

const LEAGUE_TITLE_DEFAULTS = {
  overall: { x: 176, y: 34, width: 320, height: 24, fontSize: 13, fontWeight: 'bold' },
  round: { x: 176, y: 34, width: 320, height: 24, fontSize: 13, fontWeight: 'bold' },
};

const SEASON_DEFAULTS = {
  overall: { x: 516, y: 34, width: 70, height: 24, fontSize: 12, fontWeight: 'normal' },
  round: { x: 516, y: 34, width: 70, height: 24, fontSize: 12, fontWeight: 'normal' },
};

const TITLE_DEFAULTS = {
  overall: { x: 160, y: 90, width: 400, height: 60, fontSize: 24, fontWeight: 'bold' },
  round: { x: 160, y: 92, width: 400, height: 48, fontSize: 24, fontWeight: 'bold' },
};

const LOGO_LEFT_DEFAULTS = {
  overall: { x: 20, y: 24, width: 120, height: 64 },
  round: { x: 20, y: 24, width: 120, height: 64 },
};

const LOGO_RIGHT_DEFAULTS = {
  overall: { x: 580, y: 24, width: 100, height: 64 },
  round: { x: 590, y: 24, width: 90, height: 64 },
};

function numeric(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function sanitizeText(element, defaults = {}) {
  return {
    id: String(element.id || `text-${Math.random().toString(36).slice(2, 8)}`),
    type: 'text',
    role: element.role || 'customText',
    text: String(element.text || ''),
    x: Math.round(numeric(element.x, defaults.x ?? 0)),
    y: Math.round(numeric(element.y, defaults.y ?? 0)),
    width: Math.round(Math.max(90, numeric(element.width, defaults.width ?? 200))),
    height: Math.round(Math.max(24, numeric(element.height, defaults.height ?? 44))),
    fontSize: Math.round(Math.max(8, numeric(element.fontSize, defaults.fontSize ?? 12))),
    fontFamily: element.fontFamily || defaults.fontFamily || 'Arial',
    fontWeight: element.fontWeight || defaults.fontWeight || 'normal',
  };
}

function sanitizeImage(element, defaults = {}) {
  return {
    id: String(element.id || `image-${Math.random().toString(36).slice(2, 8)}`),
    type: 'image',
    role: element.role || 'customImage',
    src: String(element.src || ''),
    storagePath: element.storagePath || '',
    x: Math.round(numeric(element.x, defaults.x ?? 0)),
    y: Math.round(numeric(element.y, defaults.y ?? 0)),
    width: Math.round(Math.max(48, numeric(element.width, defaults.width ?? 120))),
    height: Math.round(Math.max(36, numeric(element.height, defaults.height ?? 64))),
  };
}

export function normalizeRoundTitleTemplate(value) {
  const raw = String(value || '').replaceAll('\r', '').trim();
  if (!raw) return 'Ergebnisse Runde {runde}';
  if (raw.includes('{runde}')) return raw;
  if (/\s+\d+\s*$/.test(raw)) return raw.replace(/\s+\d+\s*$/, ' {runde}');
  return `${raw} {runde}`;
}

export function buildRoundTitle(value, roundNumber = 1) {
  const template = normalizeRoundTitleTemplate(value);
  return template.replace('{runde}', String(roundNumber || 1));
}

function buildLegacyElements(settings, mode, titleText) {
  const computedTitle = mode === 'overall'
    ? titleText || settings.overallHeaderText || [settings.overallTitle, settings.subtitle].filter(Boolean).join('\n')
    : titleText || buildRoundTitle(settings.roundTitle, 1);

  return [
    sanitizeImage(
      {
        id: `${mode}-left-logo`,
        role: 'leftLogo',
        src: settings.leftLogo || '',
        storagePath: settings.leftLogoPath || '',
        x: numeric(settings[`${mode}LogoLeftX`], LOGO_LEFT_DEFAULTS[mode].x),
        y: numeric(settings[`${mode}LogoLeftY`], LOGO_LEFT_DEFAULTS[mode].y),
        width: Math.max(60, numeric(settings.logoLeftWidth, LOGO_LEFT_DEFAULTS[mode].width)),
        height: LOGO_LEFT_DEFAULTS[mode].height,
      },
      LOGO_LEFT_DEFAULTS[mode]
    ),
    sanitizeText(
      {
        id: `${mode}-league-title`,
        role: 'leagueTitle',
        text: settings.pdfLeagueTitle || '',
        ...LEAGUE_TITLE_DEFAULTS[mode],
      },
      LEAGUE_TITLE_DEFAULTS[mode]
    ),
    sanitizeText(
      {
        id: `${mode}-season-text`,
        role: 'seasonText',
        text: String(settings.activeSeason || ''),
        ...SEASON_DEFAULTS[mode],
      },
      SEASON_DEFAULTS[mode]
    ),
    sanitizeText(
      {
        id: `${mode}-title`,
        role: 'title',
        text: computedTitle,
        x: TITLE_DEFAULTS[mode].x,
        y: TITLE_DEFAULTS[mode].y,
        width: TITLE_DEFAULTS[mode].width,
        height: TITLE_DEFAULTS[mode].height,
        fontSize: mode === 'overall' ? settings.overallHeaderFontSize : Math.max((settings.overallHeaderFontSize || 18) - 1, 14),
        fontFamily: mode === 'overall' ? settings.overallHeaderFontFamily : settings.overallHeaderFontFamily || 'Arial',
        fontWeight: mode === 'overall' ? settings.overallHeaderFontWeight : 'bold',
      },
      TITLE_DEFAULTS[mode]
    ),
    sanitizeImage(
      {
        id: `${mode}-right-logo`,
        role: 'rightLogo',
        src: settings.rightLogo || '',
        storagePath: settings.rightLogoPath || '',
        x: numeric(settings[`${mode}LogoRightX`], LOGO_RIGHT_DEFAULTS[mode].x),
        y: numeric(settings[`${mode}LogoRightY`], LOGO_RIGHT_DEFAULTS[mode].y),
        width: Math.max(48, numeric(settings.logoRightWidth * 2.6, LOGO_RIGHT_DEFAULTS[mode].width)),
        height: LOGO_RIGHT_DEFAULTS[mode].height,
      },
      LOGO_RIGHT_DEFAULTS[mode]
    ),
  ];
}

function ensureBaseElements(elements, settings, mode, titleText) {
  const ensured = [...elements];
  const byRole = new Map(ensured.map((element) => [element.role, element]));
  const required = buildLegacyElements(settings, mode, titleText);
  required.forEach((requiredElement) => {
    if (!byRole.has(requiredElement.role)) {
      ensured.push(requiredElement);
    }
  });
  return ensured;
}

export function getEditorElements(settings, mode, titleText) {
  const key = mode === 'round' ? 'editorElementsRound' : 'editorElementsOverall';
  const stored = Array.isArray(settings?.[key]) ? settings[key] : [];
  const sanitized = stored.map((element, index) => {
    const fallbackRole = element.role || (element.type === 'image' ? `customImage${index + 1}` : `customText${index + 1}`);
    if (element.type === 'image') {
      return sanitizeImage(
        element,
        fallbackRole === 'leftLogo'
          ? LOGO_LEFT_DEFAULTS[mode]
          : fallbackRole === 'rightLogo'
            ? LOGO_RIGHT_DEFAULTS[mode]
            : { x: 120, y: 220, width: 120, height: 70 }
      );
    }
    const baseTextElement = sanitizeText(
      element,
      fallbackRole === 'leagueTitle'
        ? LEAGUE_TITLE_DEFAULTS[mode]
        : fallbackRole === 'seasonText'
          ? SEASON_DEFAULTS[mode]
          : fallbackRole === 'title'
            ? TITLE_DEFAULTS[mode]
            : { x: 120, y: 180, width: 220, height: 44, fontSize: 12, fontWeight: 'normal' }
    );
    if (fallbackRole === 'title' && titleText) {
      return { ...baseTextElement, text: titleText };
    }
    return baseTextElement;
  });

  return ensureBaseElements(sanitized.length ? sanitized : buildLegacyElements(settings, mode, titleText), settings, mode, titleText);
}

export function applyEditorElementsToSettings(settings, mode, elements) {
  const next = { ...settings };
  const key = mode === 'round' ? 'editorElementsRound' : 'editorElementsOverall';
  const cleaned = elements.map((element) => (element.type === 'image' ? sanitizeImage(element) : sanitizeText(element)));
  next[key] = cleaned;

  const title = cleaned.find((element) => element.role === 'title' && element.type === 'text');
  if (title) {
    if (mode === 'overall') {
      const normalized = title.text.replaceAll('\r', '');
      const parts = normalized.split('\n');
      next.overallHeaderText = normalized;
      next.overallTitle = parts[0] || '';
      next.subtitle = parts.slice(1).join(' ');
      next.overallHeaderFontFamily = title.fontFamily || next.overallHeaderFontFamily;
      next.overallHeaderFontSize = title.fontSize || next.overallHeaderFontSize;
      next.overallHeaderFontWeight = title.fontWeight || next.overallHeaderFontWeight;
    } else {
      next.roundTitle = normalizeRoundTitleTemplate(title.text.replaceAll('\n', ' ').trim());
      next.overallHeaderFontFamily = title.fontFamily || next.overallHeaderFontFamily;
      next.overallHeaderFontSize = title.fontSize || next.overallHeaderFontSize;
      next.overallHeaderFontWeight = title.fontWeight || next.overallHeaderFontWeight;
    }
  }

  const leagueTitle = cleaned.find((element) => element.role === 'leagueTitle' && element.type === 'text');
  if (leagueTitle) {
    next.pdfLeagueTitle = leagueTitle.text;
  }

  const seasonText = cleaned.find((element) => element.role === 'seasonText' && element.type === 'text');
  if (seasonText) {
    const numericSeason = Number(String(seasonText.text).replace(/[^0-9]/g, ''));
    next.activeSeason = Number.isFinite(numericSeason) && numericSeason > 0 ? numericSeason : next.activeSeason;
  }

  const leftLogo = cleaned.find((element) => element.role === 'leftLogo' && element.type === 'image');
  if (leftLogo) {
    next.leftLogo = leftLogo.src || next.leftLogo;
    next.leftLogoPath = leftLogo.storagePath || next.leftLogoPath || '';
    next[`${mode}LogoLeftX`] = leftLogo.x;
    next[`${mode}LogoLeftY`] = leftLogo.y;
    next.logoLeftWidth = Math.max(24, Math.round(leftLogo.width / 2.6));
  }

  const rightLogo = cleaned.find((element) => element.role === 'rightLogo' && element.type === 'image');
  if (rightLogo) {
    next.rightLogo = rightLogo.src || next.rightLogo;
    next.rightLogoPath = rightLogo.storagePath || next.rightLogoPath || '';
    next[`${mode}LogoRightX`] = rightLogo.x;
    next[`${mode}LogoRightY`] = rightLogo.y;
    next.logoRightWidth = Math.max(18, Math.round(rightLogo.width / 2.6));
  }

  return next;
}

export function createTextElement(mode, count = 0) {
  return sanitizeText(
    {
      id: `${mode}-custom-text-${Date.now()}-${count}`,
      role: 'customText',
      text: 'Neues Textfeld',
      x: 120 + (count % 3) * 28,
      y: 170 + count * 20,
      width: 220,
      height: 48,
      fontSize: 14,
      fontFamily: 'Arial',
      fontWeight: 'normal',
    },
    { x: 120, y: 170, width: 220, height: 48, fontSize: 14 }
  );
}

export function createImageElement(mode, count = 0) {
  return sanitizeImage(
    {
      id: `${mode}-custom-image-${Date.now()}-${count}`,
      role: 'customImage',
      src: '',
      x: 140 + (count % 3) * 26,
      y: 240 + count * 16,
      width: 120,
      height: 72,
    },
    { x: 140, y: 240, width: 120, height: 72 }
  );
}
