import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import i18n from "i18next";
const t = (k: string) => i18n.t(`ui.${k}`);


const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">{t('pageNotFound')}</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          {t('returnHome')}
        </a>
      </div>
    </div>
  );
};

export default NotFound;
