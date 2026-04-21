import TechSpec from './pages/TechSpec'
import TestCases from './pages/TestCases'

const page: 'test-cases' | 'tech-spec' = 'tech-spec'

function App() {
  return page === 'tech-spec' ? <TechSpec /> : <TestCases />
}

export default App
