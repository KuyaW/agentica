<script lang="ts">
  import { ACCENTS, type Accent } from "../theme";

  interface Props {
    accent: Accent;
    onChange: (accent: Accent) => void;
  }

  let { accent, onChange }: Props = $props();
</script>

<div class="accent-picker" role="group" aria-label="Accent colour">
  {#each ACCENTS as option (option.id)}
    <button
      class="accent-dot"
      type="button"
      aria-pressed={accent === option.id}
      aria-label={`${option.label} accent`}
      title={`${option.label} accent`}
      style={`--swatch: ${option.swatch}`}
      onclick={() => onChange(option.id)}
    ></button>
  {/each}
</div>
