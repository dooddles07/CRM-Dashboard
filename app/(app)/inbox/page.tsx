"use client";

import { useState } from "react";
import { PageHeader } from "@/components/data/page-header";
import { InboxView } from "@/components/inbox/inbox-view";
import { ParamDialog, Field } from "@/components/shared/create-dialog";
import { useCareflow } from "@/lib/store";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function InboxPage() {
  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Inbox"
        description="Every patient conversation across SMS, email, WhatsApp, and logged calls, in one place."
      />
      <InboxView />
      <ComposeDialog />
    </div>
  );
}

function ComposeDialog() {
  const patients = useCareflow((s) => s.patients);
  const [patient, setPatient] = useState("");

  return (
    <ParamDialog
      param="compose"
      title="New message"
      description="Start a conversation with a patient on their preferred channel."
      submitLabel="Send"
      onSubmit={() => {
        toast("Message sent", { description: "The patient will receive it on their preferred channel." });
      }}
    >
      <Field label="To" htmlFor="cm-patient">
        <Select value={patient} onValueChange={setPatient}>
          <SelectTrigger id="cm-patient" className="w-full">
            <SelectValue placeholder="Select a patient" />
          </SelectTrigger>
          <SelectContent>
            {patients.slice(0, 30).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Channel" htmlFor="cm-channel">
        <Select defaultValue="sms">
          <SelectTrigger id="cm-channel" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["sms", "email", "whatsapp"].map((c) => (
              <SelectItem key={c} value={c}>
                {c.toUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Message" htmlFor="cm-body">
        <Textarea id="cm-body" rows={3} placeholder="Write your message…" />
      </Field>
    </ParamDialog>
  );
}
