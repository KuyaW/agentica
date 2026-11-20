import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import { applyTheme, readAccent, readTheme } from "./lib/theme";

applyTheme(readTheme(), readAccent());

const target = document.getElementById("app");

if (!target) throw new Error("Application mount element is missing.");

mount(App, { target });
