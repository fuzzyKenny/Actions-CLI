import { useState } from "react";
import { Check, ChevronRight, Copy } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import heroImageDark from "./assets/act-cli(white).svg";
import heroImageLight from "./assets/act-cli.svg";

function App() {
  const prefersReducedMotion = useReducedMotion();
  const [copied, setCopied] = useState<string | null>(null);

  const reveal = (delay = 0) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 28 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, amount: 0.25 },
          transition: {
            duration: 0.7,
            delay,
            ease: [0.22, 1, 0.36, 1] as const,
          },
        };

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);

      window.setTimeout(() => {
        setCopied((current) => (current === value ? null : current));
      }, 1500);
    } catch {
      setCopied(null);
    }
  }

  function renderCopyIcon(value: string) {
    const isCopied = copied === value;
    const Icon = isCopied ? Check : Copy;

    return (
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground"
        aria-label={isCopied ? "Copied" : "Copy"}
      >
        <Icon size={16} strokeWidth={2} />
      </span>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto w-[min(1200px,calc(100vw-2rem))] px-0 pt-8 pb-20 max-sm:w-[min(100vw-1rem,100%)]">
        <section
          className="block pt-[2.2rem] pb-8 max-sm:pt-[1.6rem]"
          id="hero"
        >
          <motion.div className="max-w-[52rem]" {...reveal(0.05)}>
            <p className="mb-5 text-[0.76rem] uppercase tracking-[0.14em] text-muted-foreground">
              TERMINAL-FIRST FOCUS SYSTEM
            </p>
            <motion.h1
              className="m-0 text-foreground"
              initial={
                prefersReducedMotion
                  ? undefined
                  : { opacity: 0, y: 20, scale: 0.94 }
              }
              animate={
                prefersReducedMotion
                  ? undefined
                  : { opacity: 1, y: 0, scale: 1 }
              }
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="sr-only">ACT-CLI</span>
              <img
                className="hidden h-auto w-full max-w-136 dark:block"
                src={heroImageDark}
                alt=""
                aria-hidden="true"
              />
              <img
                className="block h-auto w-full max-w-136 dark:hidden"
                src={heroImageLight}
                alt=""
                aria-hidden="true"
              />
            </motion.h1>
            <div className="pt-8 flex flex-col gap-2">
              <p className="text-2xl font-semibold uppercase tracking-wider text-foreground">
                ACTIONS OVER TODOS
              </p>
              <p className="max-w-150 text-lg leading-6 text-muted-foreground">
                Act turns vague tasks into executable steps so you can stop
                managing intention and start doing the next thing.
              </p>
            </div>

            <div className="mt-[1.8rem] flex flex-wrap items-center gap-4">
              <motion.button
                className="inline-flex w-fit max-w-full items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-4 text-left text-foreground max-sm:w-full"
                type="button"
                whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
                onClick={() =>
                  copyText(
                    "git clone https://github.com/fuzzyKenny/Actions-CLI",
                  )
                }
              >
                <span className="min-w-0 flex flex-1 items-center gap-2 break-all sm:break-normal sm:whitespace-nowrap">
                  <ChevronRight
                    size={16}
                    strokeWidth={2}
                    className="shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span>
                    git clone https://github.com/fuzzyKenny/Actions-CLI
                  </span>
                </span>
                {renderCopyIcon(
                  "git clone https://github.com/fuzzyKenny/Actions-CLI",
                )}
              </motion.button>
            </div>
          </motion.div>
        </section>
      </main>
    </div>
  );
}

export default App;
