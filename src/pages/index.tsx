export default function Home() {
  return null;
}

export function getServerSideProps() {
  return { redirect: { destination: "/chat", permanent: false } };
}
