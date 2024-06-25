// vite.config.ts
import { defineConfig } from "file:///C:/Users/x230/Desktop/tausveltest3/node_modules/vite/dist/node/index.js";
import { svelte } from "file:///C:/Users/x230/Desktop/tausveltest3/node_modules/@sveltejs/vite-plugin-svelte/src/index.js";
import UnoCSS from "file:///C:/Users/x230/Desktop/tausveltest3/node_modules/unocss/dist/vite.mjs";
import presetUno from "file:///C:/Users/x230/Desktop/tausveltest3/node_modules/@unocss/preset-uno/dist/index.mjs";
import tsconfigPaths from "file:///C:/Users/x230/Desktop/tausveltest3/node_modules/vite-tsconfig-paths/dist/index.mjs";
var vite_config_default = defineConfig({
  plugins: [
    UnoCSS({
      presets: [
        presetUno()
      ]
    }),
    svelte(),
    tsconfigPaths()
  ],
  // prevent vite from obscuring rust errors
  clearScreen: false,
  // Tauri expects a fixed port, fail if that port is not available
  server: {
    port: 14222,
    strictPort: true,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"]
    }
  },
  // to access the Tauri environment variables set by the CLI with information about the current target
  envPrefix: ["VITE_", "TAURI_PLATFORM", "TAURI_ARCH", "TAURI_FAMILY", "TAURI_PLATFORM_VERSION", "TAURI_PLATFORM_TYPE", "TAURI_DEBUG"],
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target: process.env.TAURI_PLATFORM == "windows" ? "chrome105" : "safari13",
    // don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFx4MjMwXFxcXERlc2t0b3BcXFxcdGF1c3ZlbHRlc3QzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFx4MjMwXFxcXERlc2t0b3BcXFxcdGF1c3ZlbHRlc3QzXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy94MjMwL0Rlc2t0b3AvdGF1c3ZlbHRlc3QzL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcbmltcG9ydCB7IHN2ZWx0ZSB9IGZyb20gJ0BzdmVsdGVqcy92aXRlLXBsdWdpbi1zdmVsdGUnXG5pbXBvcnQgVW5vQ1NTIGZyb20gJ3Vub2Nzcy92aXRlJ1xuaW1wb3J0IHByZXNldFVubyBmcm9tICdAdW5vY3NzL3ByZXNldC11bm8nXG5pbXBvcnQgdHNjb25maWdQYXRocyBmcm9tICd2aXRlLXRzY29uZmlnLXBhdGhzJztcblxuXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgICBwbHVnaW5zOiBbXG4gICAgICAgIFVub0NTUyh7XG4gICAgICAgICAgICBwcmVzZXRzOiBbXG4gICAgICAgICAgICAgICAgcHJlc2V0VW5vKClcbiAgICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgICBzdmVsdGUoKSxcbiAgICAgICAgdHNjb25maWdQYXRocygpLFxuICAgIF0sXG5cbiAgICAvLyBwcmV2ZW50IHZpdGUgZnJvbSBvYnNjdXJpbmcgcnVzdCBlcnJvcnNcbiAgICBjbGVhclNjcmVlbjogZmFsc2UsXG5cbiAgICAvLyBUYXVyaSBleHBlY3RzIGEgZml4ZWQgcG9ydCwgZmFpbCBpZiB0aGF0IHBvcnQgaXMgbm90IGF2YWlsYWJsZVxuICAgIHNlcnZlcjoge1xuICAgICAgICBwb3J0OiAxNF8yMjIsXG4gICAgICAgIHN0cmljdFBvcnQ6IHRydWUsXG4gICAgICAgIHdhdGNoOiB7XG4gICAgICAgICAgICAvLyAzLiB0ZWxsIHZpdGUgdG8gaWdub3JlIHdhdGNoaW5nIGBzcmMtdGF1cmlgXG4gICAgICAgICAgICBpZ25vcmVkOiBbXCIqKi9zcmMtdGF1cmkvKipcIl0sXG4gICAgICAgIH0sXG4gICAgfSxcblxuICAgIC8vIHRvIGFjY2VzcyB0aGUgVGF1cmkgZW52aXJvbm1lbnQgdmFyaWFibGVzIHNldCBieSB0aGUgQ0xJIHdpdGggaW5mb3JtYXRpb24gYWJvdXQgdGhlIGN1cnJlbnQgdGFyZ2V0XG4gICAgZW52UHJlZml4OiBbJ1ZJVEVfJywgJ1RBVVJJX1BMQVRGT1JNJywgJ1RBVVJJX0FSQ0gnLCAnVEFVUklfRkFNSUxZJywgJ1RBVVJJX1BMQVRGT1JNX1ZFUlNJT04nLCAnVEFVUklfUExBVEZPUk1fVFlQRScsICdUQVVSSV9ERUJVRyddLFxuXG4gICAgYnVpbGQ6IHtcbiAgICAgICAgLy8gVGF1cmkgdXNlcyBDaHJvbWl1bSBvbiBXaW5kb3dzIGFuZCBXZWJLaXQgb24gbWFjT1MgYW5kIExpbnV4XG4gICAgICAgIHRhcmdldDogcHJvY2Vzcy5lbnYuVEFVUklfUExBVEZPUk0gPT0gJ3dpbmRvd3MnID8gJ2Nocm9tZTEwNScgOiAnc2FmYXJpMTMnLFxuICAgICAgICAvLyBkb24ndCBtaW5pZnkgZm9yIGRlYnVnIGJ1aWxkc1xuICAgICAgICBtaW5pZnk6ICFwcm9jZXNzLmVudi5UQVVSSV9ERUJVRyA/ICdlc2J1aWxkJyA6IGZhbHNlLFxuICAgICAgICAvLyBwcm9kdWNlIHNvdXJjZW1hcHMgZm9yIGRlYnVnIGJ1aWxkc1xuICAgICAgICBzb3VyY2VtYXA6ICEhcHJvY2Vzcy5lbnYuVEFVUklfREVCVUcsXG4gICAgfSxcblxufSlcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBa1MsU0FBUyxvQkFBb0I7QUFDL1QsU0FBUyxjQUFjO0FBQ3ZCLE9BQU8sWUFBWTtBQUNuQixPQUFPLGVBQWU7QUFDdEIsT0FBTyxtQkFBbUI7QUFJMUIsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDeEIsU0FBUztBQUFBLElBQ0wsT0FBTztBQUFBLE1BQ0gsU0FBUztBQUFBLFFBQ0wsVUFBVTtBQUFBLE1BQ2Q7QUFBQSxJQUNKLENBQUM7QUFBQSxJQUNELE9BQU87QUFBQSxJQUNQLGNBQWM7QUFBQSxFQUNsQjtBQUFBO0FBQUEsRUFHQSxhQUFhO0FBQUE7QUFBQSxFQUdiLFFBQVE7QUFBQSxJQUNKLE1BQU07QUFBQSxJQUNOLFlBQVk7QUFBQSxJQUNaLE9BQU87QUFBQTtBQUFBLE1BRUgsU0FBUyxDQUFDLGlCQUFpQjtBQUFBLElBQy9CO0FBQUEsRUFDSjtBQUFBO0FBQUEsRUFHQSxXQUFXLENBQUMsU0FBUyxrQkFBa0IsY0FBYyxnQkFBZ0IsMEJBQTBCLHVCQUF1QixhQUFhO0FBQUEsRUFFbkksT0FBTztBQUFBO0FBQUEsSUFFSCxRQUFRLFFBQVEsSUFBSSxrQkFBa0IsWUFBWSxjQUFjO0FBQUE7QUFBQSxJQUVoRSxRQUFRLENBQUMsUUFBUSxJQUFJLGNBQWMsWUFBWTtBQUFBO0FBQUEsSUFFL0MsV0FBVyxDQUFDLENBQUMsUUFBUSxJQUFJO0FBQUEsRUFDN0I7QUFFSixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
