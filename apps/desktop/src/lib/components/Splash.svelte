<script lang="ts">
  import Logomark from "./Logomark.svelte";

  interface Props {
    /** True once the card may lift away and reveal the shell. */
    leaving?: boolean;
  }

  let { leaving = false }: Props = $props();
</script>

<!-- Purely decorative: the app behind it stays usable, and screen readers go
     straight to the shell instead of hearing a launch animation. -->
<div class="splash" data-leaving={leaving} aria-hidden="true">
  <span class="splash__halo"></span>
  <div class="splash__stage">
    <span class="splash__mark"><Logomark size={112} /></span>
    <span class="splash__name">Agentica</span>
  </div>
</div>

<style>
  /* The opening card covers the first paint, in the app's own aurora colours,
     so the shell is never seen half-assembled behind it. */
  .splash {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: grid;
    place-items: center;
    overflow: hidden;
    background:
      radial-gradient(
        38rem 30rem at 20% 12%,
        color-mix(in srgb, var(--blob-1) 42%, transparent) 0%,
        transparent 68%
      ),
      radial-gradient(
        34rem 26rem at 84% 88%,
        color-mix(in srgb, var(--blob-2) 32%, transparent) 0%,
        transparent 70%
      ),
      var(--bg);
    animation: splash-fade-in 0.25s ease both;
  }

  .splash[data-leaving="true"] {
    animation: splash-out 0.85s ease 0.05s forwards;
    pointer-events: none;
  }

  /* A soft accent bloom behind the mark, breathing while the card is held. */
  .splash__halo {
    position: absolute;
    width: 560px;
    height: 560px;
    border-radius: 50%;
    background: radial-gradient(circle, var(--accent-soft) 0%, transparent 62%);
    animation:
      splash-halo-in 1.1s var(--spring) 0.1s both,
      splash-pulse 3.2s ease-in-out 1.2s infinite;
  }

  .splash__stage {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
  }

  .splash[data-leaving="true"] .splash__stage {
    animation: splash-lift 0.75s ease forwards;
  }

  .splash__mark {
    display: block;
    width: 112px;
    height: 112px;
    filter: drop-shadow(0 22px 30px rgba(74, 56, 150, 0.38));
    animation: splash-mark-in 0.85s var(--spring) both;
  }

  .splash__name {
    display: inline-flex;
    align-items: baseline;
    font-family: var(--font-display);
    font-size: 34px;
    font-weight: 800;
    letter-spacing: -0.01em;
    color: var(--ink);
    /* The wordmark lands after the logo has settled. */
    animation: splash-name-in 0.6s var(--spring) 0.45s both;
  }

  @keyframes splash-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes splash-mark-in {
    0% {
      opacity: 0;
      transform: scale(0.55) rotate(-10deg);
    }
    62% {
      opacity: 1;
      transform: scale(1.05) rotate(2deg);
    }
    100% {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes splash-name-in {
    from {
      opacity: 0;
      transform: translateY(14px);
      letter-spacing: 0.04em;
    }
    to {
      opacity: 1;
      transform: none;
      letter-spacing: -0.01em;
    }
  }

  @keyframes splash-halo-in {
    from {
      opacity: 0;
      transform: scale(0.7);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes splash-pulse {
    0%,
    100% {
      opacity: 0.8;
      transform: scale(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.07);
    }
  }

  @keyframes splash-lift {
    to {
      opacity: 0;
      transform: translateY(-70px) scale(0.94);
    }
  }

  @keyframes splash-out {
    to {
      opacity: 0;
    }
  }
</style>
