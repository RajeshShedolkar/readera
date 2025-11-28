import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ePub, { Book, NavItem, Rendition, Location } from 'epubjs';
import './App.css';

type ThemeName = 'light' | 'sepia' | 'dark';
type TocEntry = NavItem & { depth: number };

// Extend FontOption type
type FontOption = {
  id: string;
  label: string;
  stack: string;
  style?: React.CSSProperties;
};

export const FONT_OPTIONS: FontOption[] = [
  {
    id: 'reader-sans',
    label: 'Clean Sans',
    stack:
      '"Inter", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
    style: {
      lineHeight: 1.7,
      letterSpacing: '0.3px',
      fontSize: '18px',
    },
  },
  {
    id: 'reader-serif',
    label: 'Bookish Serif',
    stack: '"Literata", "Merriweather", "Georgia", "Times New Roman", serif',
    style: {
      lineHeight: 1.8,
      letterSpacing: '0.2px',
      fontSize: '19px',
    },
  },
  {
    id: 'editorial-serif',
    label: 'Editorial Serif',
    stack: '"Newsreader", "Iowan Old Style", "Baskerville", serif',
    style: {
      lineHeight: 1.8,
      fontSize: '18px',
    },
  },
  {
    id: 'mono',
    label: 'Mono',
    stack: '"IBM Plex Mono", "Source Code Pro", "SFMono-Regular", monospace',
    style: {
      lineHeight: 1.6,
      fontSize: '16px',
    },
  },

  // 🌿 New: Multi-language (English + Marathi + Hindi)
  {
    id: 'reader-devanagari',
    label: 'Harmony (English + Marathi + Hindi)',
    stack: 'kalam',
    style: {
      backgroundColor: '#f6e4ca',
      color: '#5c4632',
      lineHeight: 1.8,
      letterSpacing: '0.75px',
      fontSize: '18px',
      padding: '32px',
      borderRadius: '12px',
    },
  },
];


const mediaStyles = (captionColor: string) => ({
  'img, svg, image, figure': {
    maxWidth: '100%',
    height: 'auto',
    objectFit: 'contain',
    display: 'block',
    margin: '1rem auto',
  },
  'figure figcaption': {
    textAlign: 'center',
    fontSize: '0.85em',
    color: captionColor,
  },
});

const readerThemes: Record<ThemeName, Record<string, any>> = {
  light: {
    body: {
      background: '#fdfdfd',
      color: '#1c1f28',
    },
    ...mediaStyles('#6b7280'),
  },
  sepia: {
    body: {
      background: '#f5ecd7',
      color: '#3b2f1d',
    },
    ...mediaStyles('#7c6751'),
  },
  dark: {
    body: {
      background: '#11131a',
      color: '#eceff4',
    },
    ...mediaStyles('#94a3b8'),
  },
};

const CUSTOM_FONT_ID = 'custom';
const DEFAULT_FONT_STACK = FONT_OPTIONS[0].stack;

const MIN_FONT_SIZE = 90;
const MAX_FONT_SIZE = 150;
const MIN_LINE_SPACING = 120;
const MAX_LINE_SPACING = 220;

const normalizeHref = (href?: string) => (href ? href.split('#')[0] : '');

const App: React.FC = () => {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [rendition, setRendition] = useState<Rendition | null>(null);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [progress, setProgress] = useState(0);
  const [fontSize, setFontSize] = useState(110);
  const [theme, setTheme] = useState<ThemeName>('light');
  const [currentChapter, setCurrentChapter] = useState('');
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fontChoice, setFontChoice] = useState<string>(FONT_OPTIONS[0].id);
  const [customFont, setCustomFont] = useState('');
  const [lineSpacing, setLineSpacing] = useState(150);
  const [activeHref, setActiveHref] = useState('');

  const hasBook = Boolean(book);
  const locationsReady = book ? book.locations.length() > 0 : false;
  const navDisabled = !hasBook || loading;
  const sliderDisabled = !locationsReady || loading;
  const tocDisabled = !hasBook || loading;
  const chapterDisplay = currentChapter || 'Choose a chapter to begin';

  const activeFontStack = useMemo(() => {
    if (fontChoice === CUSTOM_FONT_ID) {
      return customFont.trim() || DEFAULT_FONT_STACK;
    }
    return FONT_OPTIONS.find((option) => option.id === fontChoice)?.stack || DEFAULT_FONT_STACK;
  }, [fontChoice, customFont]);

  const lineHeightValue = useMemo(() => (lineSpacing / 100).toFixed(2), [lineSpacing]);

  const composedTheme = useMemo(() => {
    const baseTheme = readerThemes[theme] || readerThemes.light;
    return {
      ...baseTheme,
      // Global resets for the iframe content
      'html, body': {
        'margin': '0 !important',
        'padding': '0 !important',
        'max-width': '100% !important',
        'overflow-x': 'hidden !important',
      },
      body: {
        ...(baseTheme.body || {}),
        'font-family': activeFontStack,
        'line-height': lineHeightValue,
        'padding': '0 20px !important', // Add safe horizontal padding
        'box-sizing': 'border-box !important',
      },
      p: {
        ...(baseTheme.p || {}),
        lineHeight: lineHeightValue,
        'font-family': activeFontStack,
        'font-size': '1em !important',
        'margin-bottom': '1em !important',
      },
      li: {
        ...(baseTheme.li || {}),
        lineHeight: lineHeightValue,
        'font-family': activeFontStack,
      },
      // Targeted fixes for responsive content
      'img, svg, video, object': {
        'max-width': '100% !important',
        'height': 'auto !important',
        'box-sizing': 'border-box !important',
      },
      // Fix tables overflowing
      'table': {
        'max-width': '100% !important',
        'table-layout': 'fixed !important',
      },
      // Ensure text containers don't overflow
      'div, span, p, section, article': {
        'max-width': '100% !important',
        'box-sizing': 'border-box !important',
      }
    };
  }, [theme, activeFontStack, lineHeightValue]);

  const tocItems = useMemo<TocEntry[]>(() => {
    const flatten = (items: NavItem[], depth = 0): TocEntry[] =>
      items.reduce<TocEntry[]>((acc, item) => {
        acc.push({ ...item, depth });
        if (item.subitems && item.subitems.length) {
          acc.push(...flatten(item.subitems, depth + 1));
        }
        return acc;
      }, []);

    return flatten(toc);
  }, [toc]);

  const resolveChapterTitle = useCallback(
    (href?: string) => {
      if (!href || !tocItems.length) {
        return '';
      }

      const normalized = normalizeHref(href);
      const match = tocItems.find((item) => normalizeHref(item.href) === normalized);

      return match?.label?.trim() || '';
    },
    [tocItems],
  );

  const destroyCurrentBook = useCallback(async () => {
    if (rendition) {
      rendition.destroy();
      setRendition(null);
    }
    if (book) {
      await book.destroy();
      setBook(null);
    }
  }, [book, rendition]);

  const initialiseBook = useCallback(
    async (source: ArrayBuffer | string, name: string) => {
      if (!viewerRef.current) {
        return;
      }

      setLoading(true);
      setError(null);
      setProgress(0);
      setCurrentChapter('');
      setToc([]);
      setActiveHref('');

      await destroyCurrentBook();

      try {
        const nextBook = ePub(source, { openAs: 'binary' });
        const nextRendition = nextBook.renderTo(viewerRef.current, {
          width: '100%',
          height: '100%',
          flow: 'paginated',
          spread: 'none',
        });

        nextRendition.themes.fontSize(`${fontSize}%`);

        setBook(nextBook);
        setRendition(nextRendition);
        setFileName(name);

        await nextRendition.display();

        const navigation = await nextBook.loaded.navigation;
        setToc(navigation.toc);

        await nextBook.ready;
        if (!nextBook.locations.length()) {
          await nextBook.locations.generate(1200);
        }
      } catch (err) {
        console.error(err);
        setError('We could not open that EPUB. Please try a different file.');
        setFileName('');
        setToc([]);
        setProgress(0);
        setCurrentChapter('');
        setActiveHref('');
        await destroyCurrentBook();
      } finally {
        setLoading(false);
      }
    },
    [destroyCurrentBook, fontSize],
  );

  const handleFileSelection = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) {
      return;
    }
    const buffer = await file.arrayBuffer();
    await initialiseBook(buffer, file.name);
  };

  const handleFileInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
    await handleFileSelection(event.target.files);
    event.target.value = '';
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files?.length) {
      await handleFileSelection(event.dataTransfer.files);
      event.dataTransfer.clearData();
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const goTo = useCallback(
    async (href: string) => {
      if (!rendition) {
        return;
      }
      setActiveHref(normalizeHref(href));
      await rendition.display(href);
    },
    [rendition],
  );

  const goPrevious = useCallback(async () => {
    if (!rendition) {
      return;
    }
    await rendition.prev();
  }, [rendition]);

  const goNext = useCallback(async () => {
    if (!rendition) {
      return;
    }
    await rendition.next();
  }, [rendition]);

  const handleProgressChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!book || !rendition || !book.locations.length()) {
        return;
      }
      const value = Number(event.target.value);
      setProgress(value);
      const cfi = book.locations.cfiFromPercentage(value / 100);
      await rendition.display(cfi);
    },
    [book, rendition],
  );

  const handleFontSizeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setFontSize(value);
  };

  const handleThemeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setTheme(event.target.value as ThemeName);
  };

  const handleFontChoiceChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setFontChoice(event.target.value);
  };

  const handleCustomFontChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCustomFont(event.target.value);
  };

  const handleLineSpacingChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLineSpacing(Number(event.target.value));
  };

  useEffect(() => {
    if (!rendition) {
      return;
    }
    rendition.themes.fontSize(`${fontSize}%`);
  }, [fontSize, rendition]);

  useEffect(() => {
    if (!rendition) {
      return;
    }
    rendition.themes.register('reader-active', composedTheme);
    rendition.themes.select('reader-active');
  }, [rendition, composedTheme]);

  useEffect(() => {
    if (!book || !rendition) {
      return;
    }

    const onRelocated = (location?: Location) => {
      if (!location?.start) {
        return;
      }

      const href = normalizeHref((location.start as any)?.href as string | undefined);
      setActiveHref(href);
      const nextChapter = resolveChapterTitle(href);
      setCurrentChapter(nextChapter);

      if (book.locations.length()) {
        const percentage = book.locations.percentageFromCfi(location.start.cfi);
        const normalized = Number.isFinite(percentage)
          ? Number((percentage * 100).toFixed(1))
          : 0;
        setProgress(normalized);
      }
    };

    rendition.on('relocated', onRelocated);
    return () => {
      rendition.off('relocated', onRelocated);
    };
  }, [book, rendition, resolveChapterTitle]);

  useEffect(() => {
    return () => {
      destroyCurrentBook();
    };
  }, [destroyCurrentBook]);

  return (
    <div className={`reader-app theme-${theme}`}>
      <header className="reader-toolbar">
        <div className="brand">
          <div className="brand-title">readera</div>
          <span className="brand-subtitle">epub reader</span>
        </div>
        <div className="toolbar-actions">
          <label className="file-picker">
            <input
              type="file"
              accept=".epub,application/epub+zip"
              onChange={handleFileInput}
            />
            <span>{fileName ? 'Change book' : 'Open EPUB'}</span>
          </label>
          <div className="control-group">
            <span>Theme</span>
            <select value={theme} onChange={handleThemeChange}>
              <option value="light">Light</option>
              <option value="sepia">Sepia</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div className="control-group">
            <span>Font family</span>
            <select value={fontChoice} onChange={handleFontChoiceChange}>
              {FONT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
              <option value={CUSTOM_FONT_ID}>Custom…</option>
            </select>
            {fontChoice === CUSTOM_FONT_ID && (
              <input
                type="text"
                className="custom-font-input"
                placeholder='e.g. "Literata", serif'
                value={customFont}
                onChange={handleCustomFontChange}
              />
            )}
          </div>
          <div className="control-group">
            <span>Font size</span>
            <div className="range-wrapper">
              <input
                type="range"
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                value={fontSize}
                onChange={handleFontSizeChange}
                aria-label="Font size"
              />
              <span className="range-value">{fontSize}%</span>
            </div>
          </div>
          <div className="control-group">
            <span>Line spacing</span>
            <div className="range-wrapper">
              <input
                type="range"
                min={MIN_LINE_SPACING}
                max={MAX_LINE_SPACING}
                step={5}
                value={lineSpacing}
                onChange={handleLineSpacingChange}
                aria-label="Line spacing"
              />
              <span className="range-value">{lineHeightValue}x</span>
            </div>
          </div>
        </div>
      </header>

      <main className="reader-body">
        <aside className="toc-panel">
          <div className="toc-header">
            <span>Chapters</span>
            <span className="toc-count">{hasBook ? tocItems.length : 0}</span>
          </div>
          <div className="toc-scroll">
            {!tocItems.length && (
              <p className="toc-empty">Table of contents appears after loading a book.</p>
            )}
            {!!tocItems.length && (
              <div className="toc-list">
                {tocItems.map((item, index) => {
                  const depth = Math.min(item.depth, 3);
                  const title = item.label?.trim() || 'Untitled section';
                  const normalizedHref = normalizeHref(item.href);
                  const isActive = normalizedHref === activeHref;
                  const ordinal = String(index + 1).padStart(2, '0');
                  const childCount = item.subitems?.length || 0;
                  const depthLabel =
                    depth === 0 ? 'Chapter' : depth === 1 ? 'Section' : 'Subsection';
                  const metaLabel =
                    childCount > 0 ? `${depthLabel} · ${childCount}` : depthLabel;

                  return (
                    <button
                      key={`${item.id || item.href}-${index}`}
                      type="button"
                      className={`toc-item depth-${depth}${isActive ? ' is-active' : ''}`}
                      data-depth={depth}
                      style={{ paddingLeft: `${item.depth * 1.1 + 0.5}rem` }}
                      onClick={() => goTo(item.href)}
                      disabled={tocDisabled}
                      aria-current={isActive ? 'true' : undefined}
                    >
                      <span className="toc-index">{ordinal}</span>
                      <div className="toc-text">
                        <span className="toc-label">{title}</span>
                        <span className="toc-meta">{metaLabel}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <section className="reader-panel">
          <div className="reader-status">
            <div className="status-row">
              <span className="file-name">{fileName || 'No book selected yet'}</span>
              {loading && <span className="pill">Loading…</span>}
            </div>
            <div className="status-row">
              <span className="chapter">{chapterDisplay}</span>
              <div className="progress-control">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={0.1}
                  value={progress}
                  disabled={sliderDisabled}
                  onChange={handleProgressChange}
                  aria-label="Reading progress"
                />
                <span className="progress-value">{progress.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          <div
            className={`viewer-surface ${hasBook ? '' : 'empty'}`}
            ref={viewerRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            {!hasBook && (
              <div className="empty-state">
                <p>Drop an EPUB file here or use the button above to open one.</p>
                <p className="hint">Reading happens entirely in your browser.</p>
              </div>
            )}
          </div>

          <div className="reader-controls">
            <button type="button" onClick={goPrevious} disabled={navDisabled} aria-label="Previous page">
              ← Previous
            </button>
            <button type="button" onClick={goNext} disabled={navDisabled} aria-label="Next page">
              Next →
            </button>
          </div>
        </section>
      </main>

      {error && (
        <div className="error-banner" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
    </div>
  );
};

export default App;
