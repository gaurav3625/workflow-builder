import { auth } from "@clerk/nextjs/server";

export default async function Dashboard() {
  const data = await auth();

  return (
    <pre>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}