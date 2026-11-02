import { Component, type ReactNode } from 'react';

export default class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <section className="portal-route-error" role="alert">
      <h1>Раздел пока недоступен</h1>
      <p>Не удалось загрузить страницу. Проверьте соединение и обновите её.</p>
      <a className="portal-primary" href={window.location.href}>Обновить страницу</a>
    </section>;
    return this.props.children;
  }
}
