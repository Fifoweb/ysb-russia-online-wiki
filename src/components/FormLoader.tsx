export default function FormLoader() {
  return (
    <div className="form-loader" role="status" aria-live="polite">
      <span className="portal-form-skeleton" aria-hidden="true"><span /><span /><span /></span>
      <span>Проверяем авторизацию через Discord…</span>
    </div>
  );
}
