import { useAppStore } from '@/stores/appStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { clearContentCache } from '@/utils/contentCache';

let installed = false;

/**
 * Garante que a ação pública de limpeza remova todos os estados derivados,
 * incluindo o segundo store de reprodução e o snapshot persistido no IndexedDB.
 */
export function installStoreConsistencyGuards() {
  if (installed) return;
  installed = true;

  const originalClearAllImportedContent = useAppStore.getState().clearAllImportedContent;

  useAppStore.setState({
    clearAllImportedContent: () => {
      originalClearAllImportedContent();
      usePlaybackStore.getState().clearAllProgress();
      void clearContentCache();
    },
  });
}

installStoreConsistencyGuards();
