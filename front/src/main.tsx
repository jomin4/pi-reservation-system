import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('#root 를 찾지 못했다')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
