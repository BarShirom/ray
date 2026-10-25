import React from "react";
import "./i18n";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Provider } from "react-redux";
import { store, persistor } from "./app/store";
import { PersistGate } from "redux-persist/integration/react";
import { finishAuthRestoration } from "./features/auth/authSlice";
import { t } from "./i18n";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate
        loading={<p role="status">{t("auth.restoring")}</p>}
        onBeforeLift={() => { store.dispatch(finishAuthRestoration()); }}
        persistor={persistor}
      >
        <App />
      </PersistGate>
    </Provider>
  </React.StrictMode>
);
