import "./globals.css";

export const metadata = {
  title: "FairQueue",
  description: "Distributed waiting room and seat booking demo",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
