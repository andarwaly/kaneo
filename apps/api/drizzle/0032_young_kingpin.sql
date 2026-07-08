CREATE TABLE "task_watcher" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_watcher_task_user_unique" UNIQUE("task_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_silent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "task_watcher" ADD CONSTRAINT "task_watcher_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "task_watcher" ADD CONSTRAINT "task_watcher_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "task_watcher_taskId_idx" ON "task_watcher" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_watcher_userId_idx" ON "task_watcher" USING btree ("user_id");