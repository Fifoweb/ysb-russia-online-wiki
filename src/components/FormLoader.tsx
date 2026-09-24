export default function FormLoader() {
  return (
    <div className="form-loader" role="status" aria-live="polite">
      <span className="form-loader-spinner" aria-hidden="true" />
      <span>Проверяем авторизацию через Discord…</span>
    </div>
  );
}
