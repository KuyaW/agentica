<script lang="ts">
  import { LIMITS } from "@agentica/protocol";
  import { onDestroy, tick, untrack, type Snippet } from "svelte";
  import { cubicOut } from "svelte/easing";
  import { fade, fly, type TransitionConfig } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import Logomark from "./Logomark.svelte";
  import {
    NODE_H,
    NODE_W,
    edgePath,
    fitTransform,
    layoutBounds,
    layoutBranch,
    type BranchNode,
    type LaidOutNode,
    type Transform,
  } from "../branching";

  interface WorkspaceInfo {
    id: string;
    name: string | null;
    canvases: number | null;
  }

  interface CanvasInfo {
    id: string;
    title: string;
  }

  interface OpenWorkspace {
    id: string;
    name: string;
    canvases: CanvasInfo[];
  }

  interface Props {
    workspaces: WorkspaceInfo[];
    /** The workspace whose branch is unfolded, if any. */
    open: OpenWorkspace | null;
    connected: boolean;
    connection: Snippet;
    reconnecting: boolean;
    busy: boolean;
    error: string;
    /** Desktop only: native dialogs choose the backup file. */
    backups: boolean;
    onReconnect: () => void;
    onRefresh: () => void;
    onCreateWorkspace: (name: string) => void;
    onOpenWorkspace: (id: string) => void;
    onCollapse: () => void;
    onCreateCanvas: (title: string) => void;
    onOpenCanvas: (id: string) => void;
    onDeleteWorkspace: (id: string) => void;
    onDeleteCanvas: (id: string) => void;
    onBackup: (id: string) => Promise<boolean>;
    onOpenSettings: () => void;
  }

  let {
    workspaces,
    open,
    connected,
    connection,
    reconnecting,
    busy,
    error,
    backups,
    onReconnect,
    onRefresh,
    onCreateWorkspace,
    onOpenWorkspace,
    onCollapse,
    onCreateCanvas,
    onOpenCanvas,
    onDeleteWorkspace,
    onDeleteCanvas,
    onBackup,
    onOpenSettings,
  }: Props = $props();

  /** Beat between two siblings starting their fold. */
  const FOLD_STAGGER = 90;
  /** Most siblings that delay each other, so a wide branch stays brisk. */
  const FOLD_STAGGER_MAX = 4;
  /** How long a card takes to fly back into its parent. */
  const FOLD_OUT = 200;

  /**
   * Milliseconds a card waits before it folds: its siblings go in turn, and it
   * waits for the children folding into it, so parents fold last.
   */
  function foldWait(all: readonly { node: LaidOutNode }[], id: string): number {
    const card = all.find((item) => item.node.id === id);
    if (!card) return 0;
    const siblings = all.filter(
      (item) => item.node.parentId === card.node.parentId,
    );
    const order = siblings.findIndex((item) => item.node.id === id);
    const children = all.filter((item) => item.node.parentId === id);
    const childWait =
      children.length > 0
        ? Math.max(...children.map((child) => foldWait(all, child.node.id))) +
          FOLD_OUT
        : 0;
    return (
      Math.min(Math.max(order, 0), FOLD_STAGGER_MAX) * FOLD_STAGGER + childWait
    );
  }

  /**
   * Milliseconds a card waits before it unfolds: siblings come out one after
   * another, so a branch opens in order instead of popping out at once.
   */
  function unfoldWait(
    all: readonly { node: LaidOutNode }[],
    id: string,
  ): number {
    const card = all.find((item) => item.node.id === id);
    if (!card) return 0;
    const siblings = all.filter(
      (item) => item.node.parentId === card.node.parentId,
    );
    const order = siblings.findIndex((item) => item.node.id === id);
    return Math.min(Math.max(order, 0), FOLD_STAGGER_MAX) * FOLD_STAGGER;
  }

  /**
   * An unfolding card grows out of the card it hangs from, and a folding one
   * shrinks back into it. `from` is that card's offset, so the same tween runs
   * forwards for the intro and backwards for the outro.
   */
  function foldCard(
    _node: Element,
    {
      from,
      at = { x: 0, y: 0 },
      delay = 0,
      duration = 260,
    }: {
      from: { x: number; y: number };
      at?: { x: number; y: number };
      delay?: number;
      duration?: number;
    },
  ): TransitionConfig {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    return {
      delay: reduced ? 0 : delay,
      duration: reduced ? 0 : duration,
      easing: cubicOut,
      css: (t) =>
        `opacity: ${t}; transform: translate(${at.x + from.x * (1 - t)}px, ${
          at.y + from.y * (1 - t)
        }px) scale(${0.62 + 0.38 * t});`,
    };
  }

  let name = $state("");
  let title = $state("");
  // The map stays quiet until Add workspace opens the naming form.
  let naming = $state(false);
  let nameInput = $state<HTMLInputElement | null>(null);
  let addButton = $state<HTMLButtonElement | null>(null);

  async function startNaming() {
    naming = true;
    await tick();
    nameInput?.focus();
  }

  /** Fold the form away and put focus back on the button that opened it. */
  async function stopNaming() {
    naming = false;
    await tick();
    addButton?.focus();
  }

  /**
   * Focus leaving the field ends the naming and the panel returns to its Add
   * workspace button. Focus is left where the user put it; switching windows
   * blurs the form too, so the typed name survives a trip to another app.
   */
  function leaveNaming(event: FocusEvent) {
    const next = event.relatedTarget;
    if (next instanceof Node && (event.currentTarget as Element).contains(next))
      return;
    if (!document.hasFocus()) return;
    naming = false;
  }

  async function submitWorkspace() {
    onCreateWorkspace(name.trim());
    name = "";
    naming = false;
    await tick();
    // Creating disables the Add button, so focus falls back to the map.
    (addButton?.disabled ? mapHeading : addButton)?.focus();
  }

  // The icon spins in whole turns, so a fast reconnect still shows one.
  let turning = $state(false);
  // A failed reconnect hides the chip mid-turn; don't resume spinning later.
  // Under reduced motion the icon doesn't spin, so no iteration event clears it.
  $effect(() => {
    if (
      !reconnecting &&
      (!connected || matchMedia("(prefers-reduced-motion: reduce)").matches)
    )
      turning = false;
  });
  const locked = $derived(busy || !connected);
  // Announced once a backup file is written; cleared by the next action.
  let backedUp = $state("");

  function countLabel(canvases: number) {
    if (canvases === 0) return "No canvases";
    return canvases === 1 ? "1 canvas" : `${canvases} canvases`;
  }

  function workspaceCountLabel(count: number) {
    if (count === 0) return "No workspaces";
    return count === 1 ? "1 workspace" : `${count} workspaces`;
  }

  async function backup(id: string, label: string) {
    backedUp = "";
    if (await onBackup(id)) backedUp = `Backed up “${label}”.`;
  }

  /* -------------------------------------------------- the branching map */

  const rootKey = "root";
  const workspaceKey = (id: string) => `workspace:${id}`;
  const canvasKey = (id: string) => `canvas:${id}`;

  interface NodeInfo {
    kind: "root" | "workspace" | "canvas";
    label: string;
    meta: string;
    /** The workspace a card belongs to; empty for the root. */
    workspaceId: string;
    /** False for a workspace this build cannot read. */
    readable: boolean;
  }

  /**
   * The tree the map draws: the root in the middle, one branch per workspace,
   * and the open workspace's canvases unfolded from its own branch. Keys are
   * prefixed so a canvas and a workspace can never collide.
   */
  const tree = $derived.by(() => {
    const nodes = new Map<string, BranchNode>();
    const info = new Map<string, NodeInfo>();

    nodes.set(rootKey, {
      id: rootKey,
      children: workspaces.map((workspace) => workspaceKey(workspace.id)),
    });
    info.set(rootKey, {
      kind: "root",
      label: "Workspaces",
      meta: workspaceCountLabel(workspaces.length),
      workspaceId: "",
      readable: true,
    });

    for (const workspace of workspaces) {
      const key = workspaceKey(workspace.id);
      const expanded = open?.id === workspace.id;
      const canvases = expanded ? open.canvases : [];
      const label = workspace.name ?? "Can’t read this workspace";
      nodes.set(key, {
        id: key,
        children: canvases.map((canvas) => canvasKey(canvas.id)),
      });
      info.set(key, {
        kind: "workspace",
        label,
        meta:
          workspace.name === null || workspace.canvases === null
            ? `ID ${workspace.id}`
            : countLabel(expanded ? canvases.length : workspace.canvases),
        workspaceId: workspace.id,
        readable: workspace.name !== null,
      });
      for (const canvas of canvases) {
        const childKey = canvasKey(canvas.id);
        nodes.set(childKey, { id: childKey, children: [] });
        info.set(childKey, {
          kind: "canvas",
          label: canvas.title,
          meta: "Canvas",
          workspaceId: workspace.id,
          readable: true,
        });
      }
    }

    const expandedKeys = new Set<string>([rootKey]);
    if (open) expandedKeys.add(workspaceKey(open.id));
    return { nodes, info, expanded: expandedKeys };
  });

  const layout = $derived(layoutBranch(tree.nodes, rootKey, tree.expanded));
  const cards = $derived(
    Array.from(layout.values())
      .map((node) => ({ node, info: tree.info.get(node.id) }))
      .filter((card): card is { node: LaidOutNode; info: NodeInfo } =>
        Boolean(card.info),
      ),
  );
  const links = $derived(
    Array.from(layout.values()).flatMap((node) => {
      if (!node.parentId) return [];
      const parent = layout.get(node.parentId);
      if (!parent) return [];
      return [
        {
          id: node.id,
          d: edgePath(parent.pos, { ...node.pos, direction: node.direction }),
        },
      ];
    }),
  );

  // The cards as the last painted frame had them. By the time a card folds,
  // `cards` no longer lists it or its siblings and children, so the fold order
  // has to read the frame that still had them. Deliberately not reactive: the
  // outro is built during the update that removes the cards, before this is
  // refreshed.
  const lastFrame = { cards: [] as readonly { node: LaidOutNode }[] };
  $effect(() => {
    lastFrame.cards = cards;
  });

  /* ----------------------------------------------------- camera and pan */

  let mapEl = $state<HTMLElement | null>(null);
  let mapWidth = $state(0);
  let mapHeight = $state(0);
  let transform = $state({ x: 0, y: 0, k: 1 });
  let panning = $state(false);
  let panStart: { x: number; y: number; tx: number; ty: number } | null = null;
  // The frame of a camera glide in flight, so a new framing or a pan can take
  // over from it.
  let cameraFrame = 0;

  function stopCamera() {
    cancelAnimationFrame(cameraFrame);
  }

  onDestroy(stopCamera);

  /** Glide the camera to a framing instead of snapping the view there. */
  function glideTo(next: Transform, duration = 340) {
    stopCamera();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      transform = next;
      return;
    }
    const from = { ...transform };
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      // Ease out, so the branch settles rather than stopping dead.
      const eased = 1 - (1 - t) ** 3;
      transform = {
        k: from.k + (next.k - from.k) * eased,
        x: from.x + (next.x - from.x) * eased,
        y: from.y + (next.y - from.y) * eased,
      };
      if (t < 1) cameraFrame = requestAnimationFrame(step);
    };
    cameraFrame = requestAnimationFrame(step);
  }

  // The layout only changes when a branch or a card is added, removed or
  // renamed, so the camera reframes then and leaves a rolled canvas alone.
  const layoutKey = $derived(
    `${workspaces.map((workspace) => `${workspace.id}:${workspace.name}:${workspace.canvases}`).join(",")}|${open?.id ?? ""}:${open?.canvases.map((canvas) => `${canvas.id}:${canvas.title}`).join(",")}`,
  );

  /** One workspace card and the canvases unfolded beneath it. */
  function branchBounds(workspaceId: string) {
    const branch = workspaceKey(workspaceId);
    const nodes = Array.from(layout.values()).filter(
      (node) => node.id === branch || node.parentId === branch,
    );
    if (nodes.length === 0) return null;
    return layoutBounds(new Map(nodes.map((node) => [node.id, node])));
  }

  // Unfolding a branch glides to it, so the new canvases land in view; folding
  // it back opens out to the whole map. Anything else keeps the tree fitted
  // where it stands.
  let shownBranch: string | null = null;
  let framed = false;

  $effect(() => {
    void layoutKey;
    if (!mapWidth || !mapHeight) return;
    const viewport = { width: mapWidth, height: mapHeight };
    const openId = open?.id ?? null;
    const changed = openId !== shownBranch;
    shownBranch = openId;

    if (!framed) {
      framed = true;
      transform = fitTransform(layoutBounds(layout), viewport);
      return;
    }

    if (!changed) {
      stopCamera();
      transform = fitTransform(layoutBounds(layout), viewport);
      return;
    }

    const bounds = openId ? branchBounds(openId) : null;
    if (!bounds) {
      glideTo(fitTransform(layoutBounds(layout), viewport));
      return;
    }

    const fit = fitTransform(bounds, viewport, 90);
    // Pan to the branch without zooming in past the user's own scale.
    const k = Math.min(
      untrack(() => transform.k),
      fit.k,
    );
    glideTo({
      k,
      x: mapWidth / 2 - ((bounds.min.x + bounds.max.x) / 2) * k,
      y: mapHeight / 2 - ((bounds.min.y + bounds.max.y) / 2) * k,
    });
  });

  function startPan(event: PointerEvent) {
    if (event.button !== 0) return;
    // Pressing a control must never start a pan: the capture that follows
    // would retarget the pointer release and swallow the control's click.
    if (
      (event.target as HTMLElement).closest(
        "button, input, label, a, .map__create, .map__tools, .map__back",
      )
    )
      return;
    stopCamera();
    panning = true;
    panStart = {
      x: event.clientX,
      y: event.clientY,
      tx: transform.x,
      ty: transform.y,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function movePan(event: PointerEvent) {
    if (!panning || !panStart) return;
    transform = {
      ...transform,
      x: panStart.tx + event.clientX - panStart.x,
      y: panStart.ty + event.clientY - panStart.y,
    };
  }

  function endPan(event: PointerEvent) {
    if (!panning) return;
    panning = false;
    panStart = null;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(
      event.pointerId,
    );
  }

  function zoomAt(factor: number, px: number, py: number) {
    stopCamera();
    const k = Math.min(1.6, Math.max(0.2, transform.k * factor));
    const ratio = k / transform.k;
    transform = {
      k,
      x: px - (px - transform.x) * ratio,
      y: py - (py - transform.y) * ratio,
    };
  }

  function zoomBy(factor: number) {
    zoomAt(factor, mapWidth / 2, mapHeight / 2);
  }

  function fit() {
    stopCamera();
    transform = fitTransform(layoutBounds(layout), {
      width: mapWidth,
      height: mapHeight,
    });
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault();
    const rect = mapEl?.getBoundingClientRect();
    if (!rect) return;
    zoomAt(
      Math.exp(-event.deltaY * 0.0015),
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
  }

  /** Centre one card so a confirmation panel stays readable at any zoom. */
  function reveal(key: string) {
    const node = layout.get(key);
    if (!node || !mapWidth || !mapHeight) return;
    stopCamera();
    const k = Math.max(transform.k, 0.9);
    transform = {
      k,
      x: mapWidth / 2 - (node.pos.x + NODE_W / 2) * k,
      y: mapHeight / 2 - (node.pos.y + NODE_H / 2) * k,
    };
  }

  /* -------------------------------------------------- delete confirmation */

  /** The branch or leaf asking to be deleted; storage removal is destructive. */
  let confirming = $state<{ kind: "workspace" | "canvas"; id: string } | null>(
    null,
  );
  // The confirmation hands focus to its safe choice and returns it to the
  // delete button when it is dismissed.
  let keepButton = $state<HTMLButtonElement | null>(null);
  // The map heading is the anchor for focus once a deleted card takes the
  // focused button with it.
  let mapHeading = $state<HTMLHeadingElement | null>(null);
  const deleteButtons = new Map<string, HTMLButtonElement>();
  const keyOf = (kind: "workspace" | "canvas", id: string) => `${kind}:${id}`;

  function trackDelete(node: HTMLButtonElement, key: string) {
    deleteButtons.set(key, node);
    return {
      destroy() {
        deleteButtons.delete(key);
      },
    };
  }

  function isConfirming(kind: "workspace" | "canvas", id: string) {
    return confirming?.kind === kind && confirming.id === id;
  }

  async function askDelete(kind: "workspace" | "canvas", id: string) {
    confirming = { kind, id };
    reveal(kind === "workspace" ? workspaceKey(id) : canvasKey(id));
    await tick();
    keepButton?.focus();
  }

  async function cancelDelete(kind: "workspace" | "canvas", id: string) {
    confirming = null;
    await tick();
    deleteButtons.get(keyOf(kind, id))?.focus();
  }

  async function confirmDelete(kind: "workspace" | "canvas", id: string) {
    confirming = null;
    if (kind === "workspace") onDeleteWorkspace(id);
    else onDeleteCanvas(id);
    await tick();
    // The confirmation and its button leave with the card, so focus goes to
    // the map heading rather than back to the top of the page.
    mapHeading?.focus();
  }

  function onConfirmKeydown(
    event: KeyboardEvent,
    kind: "workspace" | "canvas",
    id: string,
  ) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    void cancelDelete(kind, id);
  }
</script>

<div class="home picker">
  <header class="home__bar">
    <span class="home__brand">
      <Logomark class="home__logo" />
      Agentica
    </span>
    <span class="home__tools">
      {#if connected || reconnecting}
        <span class="home__ready" class:home__ready--busy={reconnecting}>
          <span class="home__dot"></span>{reconnecting
            ? "Connecting…"
            : "Ready"}
          <button
            class="home__reconnect"
            class:home__reconnect--turning={turning}
            type="button"
            title="Reconnect to the backend"
            aria-label="Reconnect to the backend"
            disabled={busy}
            onclick={() => {
              turning = true;
              onReconnect();
            }}
            onanimationiteration={() => {
              if (!reconnecting) turning = false;
            }}
          >
            <Icon name="sync" size={18} />
          </button>
        </span>
      {/if}
      <button class="btn btn--ghost" type="button" onclick={onOpenSettings}>
        <Icon name="settings" size={18} />
        Settings
      </button>
    </span>
  </header>

  <!-- Without a backend there is no Ready button, so the controls sit in the
       page where they can't be missed. -->
  {#if !connected}
    <div class="home__conn">
      {@render connection()}
    </div>
  {/if}

  <div class="stage">
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <section
      class="map"
      class:map--panning={panning}
      bind:this={mapEl}
      bind:clientWidth={mapWidth}
      bind:clientHeight={mapHeight}
      aria-label="Workspaces and canvases"
      onpointerdown={startPan}
      onpointermove={movePan}
      onpointerup={endPan}
      onpointercancel={endPan}
      onwheel={onWheel}
    >
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <h1 class="sr-only" bind:this={mapHeading} tabindex="-1">
        Workspaces and canvases
      </h1>
      <div
        class="map__grid"
        aria-hidden="true"
        style:background-position={`${transform.x}px ${transform.y}px`}
      ></div>

      <div class="map__create" class:map__create--slim={!open && !naming}>
        <!-- An open workspace is the job at hand, so its own creation is out of
             the way and only the canvas form stays. -->
        {#if !open}
          <!-- The form and its button share one cell, so the cross-fade never
               stacks them and the panel keeps a single row while it morphs. -->
          <div class="create__swap">
            {#if naming}
              <form
                class="create"
                aria-label="Create workspace"
                onsubmit={(event) => {
                  event.preventDefault();
                  void submitWorkspace();
                }}
                onfocusout={leaveNaming}
                in:fly={{ x: 6, duration: 200, easing: cubicOut }}
                out:fade={{ duration: 120 }}
              >
                <label class="sr-only" for="workspace-name"
                  >Workspace name</label
                >
                <input
                  id="workspace-name"
                  bind:this={nameInput}
                  bind:value={name}
                  required
                  maxlength={LIMITS.label}
                  placeholder="Workspace name"
                  autocomplete="off"
                  onkeydown={(event) => {
                    if (event.key !== "Escape") return;
                    event.preventDefault();
                    void stopNaming();
                  }}
                />
                <button
                  class="btn btn--primary"
                  type="submit"
                  disabled={locked || !name.trim()}
                >
                  {#if busy}<span class="spinner"></span>{/if}
                  Create workspace
                </button>
              </form>
            {:else}
              <button
                class="btn btn--primary create__add"
                type="button"
                bind:this={addButton}
                disabled={locked}
                in:fade={{ duration: 160 }}
                out:fade={{ duration: 100 }}
                onclick={() => void startNaming()}
              >
                <Icon name="add" size={18} />
                Add workspace
              </button>
            {/if}
          </div>
        {/if}

        {#if open}
          <form
            class="create"
            aria-label={`Create canvas in ${open.name}`}
            onsubmit={(event) => {
              event.preventDefault();
              onCreateCanvas(title.trim());
            }}
          >
            <label class="sr-only" for="canvas-title">Canvas title</label>
            <input
              id="canvas-title"
              bind:value={title}
              required
              maxlength={LIMITS.label}
              placeholder="Canvas name"
              autocomplete="off"
            />
            <button
              class="btn btn--primary"
              type="submit"
              disabled={locked || !title.trim()}
            >
              {#if busy}<span class="spinner"></span>{/if}
              Create canvas
            </button>
          </form>
        {/if}
      </div>

      {#if workspaces.length === 0}
        <div class="map__empty">
          <p>
            Nothing here yet. Name your first workspace and it’ll branch out
            here.
          </p>
        </div>
      {:else}
        <div
          class="map__world"
          style:transform={`translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`}
        >
          <svg class="map__edges" aria-hidden="true">
            {#each links as link (link.id)}
              <path
                class="map__edge"
                d={link.d}
                in:fade={{ duration: 200 }}
                out:fade={{ duration: 120 }}
              />
            {/each}
          </svg>

          {#each cards as card (card.node.id)}
            {@const workspaceId = card.info.workspaceId}
            {@const parent = card.node.parentId
              ? layout.get(card.node.parentId)
              : null}
            {@const fold = parent
              ? {
                  x: parent.pos.x - card.node.pos.x,
                  y: parent.pos.y - card.node.pos.y,
                }
              : { x: 0, y: 0 }}
            <div
              class="map__node"
              style:transform={`translate3d(${card.node.pos.x}px, ${card.node.pos.y}px, 0)`}
              in:foldCard={{
                from: fold,
                at: card.node.pos,
                delay: unfoldWait(cards, card.node.id),
                duration: 280,
              }}
              out:foldCard={{
                from: fold,
                at: card.node.pos,
                delay: foldWait(lastFrame.cards, card.node.id),
                duration: FOLD_OUT,
              }}
            >
              {#if card.info.kind === "root"}
                <div class="card card--root">
                  <button
                    class="card__open"
                    type="button"
                    disabled={!open || locked}
                    title={open ? "Show every workspace" : "Workspaces"}
                    onclick={onCollapse}
                  >
                    <span class="card__badge"
                      ><Icon name="workspaces" size={20} /></span
                    >
                    <span class="card__copy">
                      <span class="card__name">{card.info.label}</span>
                      <span class="card__meta">{card.info.meta}</span>
                    </span>
                  </button>
                </div>
              {:else if card.info.kind === "workspace"}
                {@const expanded = open?.id === workspaceId}
                {@const confirmingCard = isConfirming("workspace", workspaceId)}
                <div class="card" class:card--open={expanded}>
                  <button
                    class="card__open"
                    type="button"
                    aria-expanded={expanded}
                    disabled={locked || confirmingCard}
                    title={expanded
                      ? `Close ${card.info.label}`
                      : `Open ${card.info.label}`}
                    onclick={() =>
                      expanded ? onCollapse() : onOpenWorkspace(workspaceId)}
                  >
                    <span class="card__chevron"
                      ><Icon
                        name={expanded ? "expand_more" : "chevron_right"}
                        size={18}
                      /></span
                    >
                    <span class="card__copy">
                      <span class="card__name">{card.info.label}</span>
                      <span class="card__meta">{card.info.meta}</span>
                    </span>
                  </button>
                  <span class="card__tools">
                    <button
                      class="card__tool"
                      type="button"
                      title="Back up workspace"
                      aria-label={`Back up ${card.info.label}`}
                      disabled={locked || !backups || !card.info.readable}
                      onclick={() => void backup(workspaceId, card.info.label)}
                    >
                      <Icon name="save_alt" size={15} />
                    </button>
                    <button
                      class="card__tool card__tool--danger"
                      type="button"
                      title="Delete workspace"
                      aria-label={`Delete ${card.info.label}`}
                      disabled={locked}
                      use:trackDelete={keyOf("workspace", workspaceId)}
                      onclick={() => void askDelete("workspace", workspaceId)}
                    >
                      <Icon name="delete_outline" size={15} />
                    </button>
                  </span>
                </div>

                {#if confirmingCard}
                  <div
                    class="card__confirm"
                    role="group"
                    aria-label="Confirm delete"
                    in:fly={{ y: -6, duration: 180, easing: cubicOut }}
                    out:fly={{ y: -6, duration: 120, easing: cubicOut }}
                  >
                    <span
                      >Delete “{card.info.label}” and everything in it from this
                      computer?</span
                    >
                    <span class="tile__actions">
                      <button
                        class="btn btn--danger"
                        type="button"
                        disabled={busy}
                        onkeydown={(event) =>
                          onConfirmKeydown(event, "workspace", workspaceId)}
                        onclick={() =>
                          void confirmDelete("workspace", workspaceId)}
                      >
                        Delete
                      </button>
                      <button
                        class="btn btn--ghost"
                        type="button"
                        bind:this={keepButton}
                        onkeydown={(event) =>
                          onConfirmKeydown(event, "workspace", workspaceId)}
                        onclick={() =>
                          void cancelDelete("workspace", workspaceId)}
                      >
                        Keep it
                      </button>
                    </span>
                  </div>
                {/if}
              {:else}
                {@const confirmingCard = isConfirming(
                  "canvas",
                  card.node.id.slice("canvas:".length),
                )}
                {@const canvasId = card.node.id.slice("canvas:".length)}
                <div class="card">
                  <button
                    class="card__open"
                    type="button"
                    disabled={locked || confirmingCard}
                    title={card.info.label}
                    onclick={() => onOpenCanvas(canvasId)}
                  >
                    <span class="card__badge card__badge--canvas"
                      ><Icon name="dashboard" size={16} /></span
                    >
                    <span class="card__copy">
                      <span class="card__name">{card.info.label}</span>
                      <span class="card__meta">{card.info.meta}</span>
                    </span>
                  </button>
                  <button
                    class="card__tool card__tool--danger"
                    type="button"
                    title="Delete canvas"
                    aria-label={`Delete ${card.info.label}`}
                    disabled={locked}
                    use:trackDelete={keyOf("canvas", canvasId)}
                    onclick={() => void askDelete("canvas", canvasId)}
                  >
                    <Icon name="delete_outline" size={15} />
                  </button>
                </div>

                {#if confirmingCard}
                  <div
                    class="card__confirm"
                    role="group"
                    aria-label="Confirm delete"
                    in:fly={{ y: -6, duration: 180, easing: cubicOut }}
                    out:fly={{ y: -6, duration: 120, easing: cubicOut }}
                  >
                    <span
                      ><strong>Delete “{card.info.label}”?</strong> Its content is
                      removed from this device.</span
                    >
                    <span class="tile__actions">
                      <button
                        class="btn btn--danger"
                        type="button"
                        disabled={busy}
                        onkeydown={(event) =>
                          onConfirmKeydown(event, "canvas", canvasId)}
                        onclick={() => void confirmDelete("canvas", canvasId)}
                      >
                        <Icon name="delete_forever" size={16} />Delete
                      </button>
                      <button
                        class="btn btn--ghost"
                        type="button"
                        bind:this={keepButton}
                        onkeydown={(event) =>
                          onConfirmKeydown(event, "canvas", canvasId)}
                        onclick={() => void cancelDelete("canvas", canvasId)}
                      >
                        Cancel
                      </button>
                    </span>
                  </div>
                {/if}
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      {#if open}
        <button
          class="map__back"
          type="button"
          title="Show every workspace"
          disabled={locked}
          onclick={onCollapse}
        >
          <Icon name="arrow_back" size={16} />
          All workspaces
        </button>
      {/if}

      <div class="map__tools">
        <button
          type="button"
          title="Refresh workspace list"
          aria-label="Refresh workspace list"
          disabled={locked}
          onclick={onRefresh}
        >
          <Icon name="refresh" size={18} />
        </button>
        <button
          type="button"
          title="Zoom out"
          aria-label="Zoom out"
          onclick={() => zoomBy(1 / 1.2)}
        >
          <Icon name="zoom_out" size={18} />
        </button>
        <button
          type="button"
          title="Zoom in"
          aria-label="Zoom in"
          onclick={() => zoomBy(1.2)}
        >
          <Icon name="zoom_in" size={18} />
        </button>
        <button
          type="button"
          title="Fit the tree to the window"
          aria-label="Fit the tree to the window"
          onclick={fit}
        >
          <Icon name="center_focus_strong" size={18} />
        </button>
      </div>

      <p class="sr-only" role="status">{backedUp}</p>
      {#if backedUp && !error}
        <p class="map__note" aria-hidden="true">{backedUp}</p>
      {/if}
      {#if error}
        <p class="alert map__alert" role="alert">{error}</p>
      {/if}
    </section>
  </div>
</div>

<style>
  .picker {
    overflow: hidden;
  }

  .stage {
    flex: 1;
    min-height: 0;
    display: flex;
    padding: 0 2rem 1.5rem;
    box-sizing: border-box;
  }

  /* ------------------------------------------------------ the branch map */

  .map {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 22rem;
    overflow: hidden;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-inset);
    cursor: grab;
    touch-action: none;
    user-select: none;
  }

  .map--panning {
    cursor: grabbing;
  }

  .map__grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image: radial-gradient(
      circle,
      var(--line-strong) 1.2px,
      transparent 1.2px
    );
    background-size: 26px 26px;
  }

  .map__world {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    will-change: transform;
  }

  .map__edges {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    overflow: visible;
    pointer-events: none;
  }

  .map__edge {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-linecap: round;
    opacity: 0.3;
  }

  .map__node {
    position: absolute;
    top: 0;
    left: 0;
    /* Glide to new places when an unfolding branch pushes cards aside. */
    transition: transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .map__empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 2rem;
    text-align: center;
    color: var(--ink-soft);
    pointer-events: none;
  }

  .map__empty p {
    margin: 0;
    max-width: 32ch;
    line-height: 1.5;
  }

  .map__back {
    position: absolute;
    top: 0.85rem;
    left: 0.85rem;
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.1rem;
    padding: 0 0.75rem;
    font: inherit;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--ink-soft);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: var(--shadow-sm);
    cursor: pointer;
  }

  .map__back:hover:not(:disabled) {
    color: var(--accent-strong);
    background: var(--accent-soft);
  }

  .map__back:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .map__tools {
    position: absolute;
    right: 0.85rem;
    bottom: 0.85rem;
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 0.15rem;
    padding: 0.3rem;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }

  .map__tools button {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    color: var(--ink-soft);
    background: none;
    border: 0;
    border-radius: 9px;
    cursor: pointer;
    transition:
      color 0.16s ease,
      background 0.16s ease;
  }

  .map__tools button:hover:not(:disabled) {
    color: var(--accent-strong);
    background: var(--accent-soft);
  }

  .map__tools button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .map__create {
    position: absolute;
    top: 0.85rem;
    right: 0.85rem;
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    width: min(23rem, calc(100% - 1.7rem));
    padding: 0.4rem;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    transition: width 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .create {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  /* One cell for both states: the outgoing element stays in place while it
     fades, so the panel never doubles its height mid-morph. */
  .create__swap {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .create__swap > .create,
  .create__swap > .create__add {
    grid-area: 1 / 1;
    min-width: 0;
  }

  .create input {
    flex: 1;
    min-width: 0;
    min-height: 2.25rem;
    padding: 0 0.7rem;
    font: inherit;
    font-size: 0.82rem;
    color: var(--ink);
    background: var(--surface-soft);
    border: 1px solid var(--line-strong);
    border-radius: 11px;
    box-shadow: var(--shadow-inset);
  }

  .create input::placeholder {
    color: var(--muted);
  }

  .create .btn,
  .create__add {
    flex: none;
    min-height: 2.25rem;
    padding: 0 0.8rem;
    font-size: 0.8rem;
    border-radius: 11px;
  }

  /* Collapsed to just Add workspace the panel is narrow; opening the naming
     form widens it back out, so the two states morph rather than swap. */
  .map__create--slim {
    width: min(11.5rem, calc(100% - 1.7rem));
  }

  .create__add {
    width: 100%;
  }

  .map__note,
  .map__alert {
    position: absolute;
    left: 0.85rem;
    bottom: 0.85rem;
    z-index: 4;
    margin: 0;
    max-width: min(26rem, calc(100% - 12rem));
  }

  .map__note {
    padding: 0.35rem 0.7rem;
    font-size: 0.82rem;
    color: var(--ink-soft);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: var(--shadow-sm);
  }

  /* ---------------------------------------------------------- the cards */

  .card {
    position: relative;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 236px;
    height: 64px;
    padding: 8px 9px;
    border: 1px solid var(--surface-edge);
    border-radius: 18px;
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }

  .card--root {
    gap: 0.55rem;
    padding: 8px 12px;
    background: var(--surface-soft);
    box-shadow:
      0 0 0 2px var(--accent-soft),
      var(--shadow-sm);
  }

  .card--open {
    border-color: var(--accent);
    box-shadow:
      0 0 0 2px var(--accent-soft),
      var(--shadow-sm);
  }

  /* The open branch keeps one ripple going, so the map always shows which
     card the canvases below belong to. Two rings offset in time keep it
     breathing without a gap. The ring grows by the same distance on every
     side, so the pulse reads vertically as well as horizontally. */
  .card--open::before,
  .card--open::after {
    content: "";
    position: absolute;
    inset: -1px;
    border: 1.5px solid var(--accent);
    border-radius: inherit;
    pointer-events: none;
    animation: card-ripple 2.2s ease-out infinite;
  }

  .card--open::after {
    animation-delay: 1.1s;
  }

  @keyframes card-ripple {
    from {
      opacity: 0.5;
      inset: -1px;
    }
    to {
      opacity: 0;
      inset: -12px;
    }
  }

  /* The global reduced-motion rule only shortens each iteration; stop them. */
  @media (prefers-reduced-motion: reduce) {
    .card--open::before,
    .card--open::after {
      animation: none;
      opacity: 0;
    }
  }

  /* The hub is a control only while a branch is open; when it is not, it
     stays a label rather than looking like a faded button. */
  .card--root .card__open:disabled {
    opacity: 1;
    cursor: default;
  }

  .card__badge {
    flex: none;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 12px;
    color: var(--accent-strong);
    background: var(--accent-soft);
  }

  .card__badge--canvas {
    width: 26px;
    height: 26px;
    border-radius: 9px;
    color: var(--ink-soft);
    background: var(--surface-soft);
  }

  .card__open {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    font: inherit;
    color: inherit;
    text-align: left;
    background: none;
    border: 0;
    border-radius: 12px;
    cursor: pointer;
  }

  .card__open:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .card__chevron {
    flex: none;
    display: grid;
    place-items: center;
    width: 18px;
    color: var(--muted);
  }

  .card--open .card__chevron {
    color: var(--accent-strong);
  }

  .card__copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .card__name {
    font-size: 12.5px;
    font-weight: 800;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card__meta {
    font-size: 10.5px;
    font-weight: 700;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card__tools {
    flex: none;
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .card__tool {
    flex: none;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    color: var(--ink-soft);
    background: var(--surface-soft);
    border: 0;
    border-radius: 9px;
    cursor: pointer;
    transition:
      color 0.16s ease,
      background 0.16s ease;
  }

  .card__tool:hover:not(:disabled) {
    color: var(--accent-strong);
    background: var(--accent-soft);
  }

  .card__tool--danger:hover:not(:disabled) {
    color: var(--bad);
    background: var(--bad-soft);
  }

  .card__tool:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* The confirmation overlays its own card, then grows over the gap below it
     so the question never clips inside the 64px card. */
  .card__confirm {
    position: absolute;
    top: -1px;
    left: -1px;
    z-index: 3;
    box-sizing: border-box;
    width: 236px;
    min-height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 0.45rem;
    padding: 0.6rem 0.65rem;
    font-size: 0.72rem;
    line-height: 1.3;
    color: var(--ink);
    background: var(--bad-soft);
    border: 1px solid var(--bad-line);
    border-radius: 16px;
    box-shadow: var(--shadow-lg);
  }

  .card__confirm .btn {
    min-height: 1.75rem;
    padding: 0 0.6rem;
    font-size: 0.72rem;
    border-radius: 9px;
  }

  @media (max-width: 900px) {
    .stage {
      padding: 0 1rem 1rem;
    }

    .map {
      min-height: 22rem;
    }
  }

  @media (max-width: 640px) {
    .map__create {
      left: 0.85rem;
      width: auto;
    }

    .map__back {
      top: auto;
      bottom: 0.85rem;
    }

    .map__note,
    .map__alert {
      bottom: 3.6rem;
      max-width: calc(100% - 1.7rem);
    }
  }
</style>
