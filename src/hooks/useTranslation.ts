import { useState, useEffect, useCallback } from 'react';

interface Translation {
  title: string;
  content: string;
}

const AVAILABLE_LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'bg', label: 'Български', flag: '🇧🇬' },
];

export function useTranslation() {
  const [language, setLanguage] = useState('en');
  const [translations, setTranslations] = useState<Record<string, Translation>>({});
  const [loading, setLoading] = useState(false);

  const fetchTranslations = useCallback(async (langCode: string) => {
    if (langCode === 'en') {
      setTranslations({});
      return;
    }

    setLoading(true);
    try {
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(
        `${url}/rest/v1/chapter_translations?language_code=eq.${langCode}&select=chapter_id,title,content`,
        {
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
          },
        }
      );

      const data = await response.json();
      if (Array.isArray(data)) {
        const map: Record<string, Translation> = {};
        data.forEach((t: any) => {
          map[t.chapter_id] = { title: t.title, content: t.content };
        });
        setTranslations(map);
      }
    } catch (err) {
      console.error('[useTranslation] error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const switchLanguage = useCallback((langCode: string) => {
    setLanguage(langCode);
    fetchTranslations(langCode);
  }, [fetchTranslations]);

  const getTranslatedChapter = useCallback((chapter: { id: string; title: string; content: string }) => {
    if (language === 'en' || !translations[chapter.id]) {
      return { title: chapter.title, content: chapter.content };
    }
    return translations[chapter.id];
  }, [language, translations]);

  return {
    language,
    switchLanguage,
    getTranslatedChapter,
    loading,
    availableLanguages: AVAILABLE_LANGUAGES,
  };
}
