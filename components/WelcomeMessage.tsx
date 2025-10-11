export default function WelcomeMessage() {
  return (
    <div className="flex flex-col items-center justify-center h-full mt-10">
      <div className="bg-black rounded-2xl shadow-sm ring-1 ring-inset ring-gray-200 px-6 py-5 max-w-lg w-full">
        <h2 className="text-xl font-semibold text-red-100 mb-2">
          Luna AI Agent chat
        </h2>
        <p className="text-gray-300 mb-4 leading-relaxed">
          I can help you with:
        </p>
        <ul className="space-y-2 text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-red-100 mt-1">*</span>
            <span>Solving math and code problems</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-100 mt-1">*</span>
            <span>Searching through Google Books</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-100 mt-1">*</span>
            <span>Searching through wikipedia</span>
          </li>
        </ul>
        <p className="text-red-200 mt-4 leading-relaxed">
          Feel free to ask me anything! I’m here to help.
        </p>
      </div>
    </div>
  );
}
