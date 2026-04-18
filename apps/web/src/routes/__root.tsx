import { createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";

import { AppLayout } from "@/components/layout";
import { useTheme } from "@/components/theme-provider";

export const Route = createRootRoute({
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
