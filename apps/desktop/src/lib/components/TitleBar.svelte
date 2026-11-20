<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { desktopMode } from "../runtime";
  import type { Accent } from "../theme";
  import AccentPicker from "./AccentPicker.svelte";
  import Icon from "./Icon.svelte";
  import Logomark from "./Logomark.svelte";

  interface Props {
    /** The clay accent palette applied across the UI. */
    accent: Accent;
    onAccentChange: (accent: Accent) => void;
  }

  let { accent, onAccentChange }: Props = $props();

  // Only the desktop window has native controls to replace.
  const appWindow = desktopMode ? getCurrentWindow() : undefined;
  let maximized = $state(false);

  onMount(() => {
    if (!appWindow) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const sync = () => {
      void appWindow.isMaximized().then((value) => {
        if (!disposed) maximized = value;
      });
    };
    sync();
    void appWindow.onResized(sync).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  });

  function minimize() {
    void appWindow?.minimize().catch(() => undefined);
  }

  function toggleMaximize() {
    void appWindow?.toggleMaximize().catch(() => undefined);
  }

  function close() {
    // Routes through the existing close-request guard for unsaved edits.
    void appWindow?.close().catch(() => undefined);
  }
</script>

<header class="titlebar" data-tauri-drag-region>
  <span class="titlebar__brand">
    <Logomark class="titlebar__mark" size={22} />
    <span>Agentica</span>
  </span>
  <div class="titlebar__spacer"></div>
  <AccentPicker {accent} onChange={onAccentChange} />
  <div class="titlebar__controls">
    <button
      class="titlebar__control"
      type="button"
      aria-label="Minimize window"
      title="Minimize"
      onclick={minimize}
    >
      <Icon name="remove" size={18} />
    </button>
    <button
      class="titlebar__control"
      type="button"
      aria-label={maximized ? "Restore window" : "Maximize window"}
      title={maximized ? "Restore" : "Maximize"}
      onclick={toggleMaximize}
    >
      <Icon name={maximized ? "filter_none" : "crop_square"} size={16} />
    </button>
    <button
      class="titlebar__control titlebar__control--close"
      type="button"
      aria-label="Close window"
      title="Close"
      onclick={close}
    >
      <Icon name="close" size={18} />
    </button>
  </div>
</header>
