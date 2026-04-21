import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";

import { AppLayout } from "@/components/layout";
import { useTheme } from "@/components/theme-provider";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => {
    const { routerDevtools } = useTheme();

    return (
      <>
        <AppLayout />
        {routerDevtools && <TanStackRouterDevtools position="bottom-right" />}
      </>
    );
  },
});
