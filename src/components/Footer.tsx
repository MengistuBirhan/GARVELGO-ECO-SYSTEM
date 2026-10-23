export function AppFooter() {
  return (
    <footer className="mt-auto py-5 px-4 text-center border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed">
        Developed by Developer Mengistu
        <span className="mx-1.5 text-slate-300 dark:text-slate-600">|</span>
        <span className="am">© 2019 ዓ.ም. መብቱ በህግ የተጠበቀ ነው።</span>
        <span className="mx-1.5 text-slate-300 dark:text-slate-600">(All Rights Reserved)</span>
      </p>
    </footer>
  );
}

export function PrintFooter() {
  return (
    <div className="mt-5 pt-3 border-t border-slate-200 text-center">
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Developed by Developer Mengistu
        <span className="mx-1.5 text-slate-300">|</span>
        <span className="am">© 2019 ዓ.ም. መብቱ በህግ የተጠበቀ ነው።</span>
        <span className="mx-1.5 text-slate-300">(All Rights Reserved)</span>
      </p>
    </div>
  );
}
