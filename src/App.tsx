/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";
import React, { useState, useEffect, useRef, createContext, useContext, ReactNode, Component } from "react";
import { Book, Library, User, LogIn, LogOut, Search, QrCode, History, Plus, Trash2, AlertCircle, CheckCircle, Clock, IndianRupee, ArrowRight, Menu, X, ChevronRight, LayoutDashboard, Settings, Bell } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format, differenceInDays, addDays, isAfter } from "date-fns";
import { Html5QrcodeScanner } from "html5-qrcode";
import { 
  auth, db, signInWithGoogle, logout as firebaseLogout, 
  FirebaseUser, onAuthStateChanged, 
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, 
  query, where, onSnapshot, 
  handleFirestoreError, OperationType 
} from "./firebase";

// Logo URL
const HIT_LOGO_URL = "https://hithaldia.ac.in/wp-content/uploads/2021/07/cropped-Banner_Hit.png";

// Types
interface BookData {
  id: string;
  title: string;
  author: string;
  isbn: string;
  category: string;
  totalCopies: number;
  availableCopies: number;
}

interface Transaction {
  id: string;
  bookId: string;
  bookTitle: string;
  userId: string;
  userName: string;
  rollNumber: string;
  issueDate: string;
  dueDate: string;
  returnDate?: string;
  status: 'issued' | 'returned';
  fine: number;
  lastNotifiedAt?: string;
}

interface UserProfile {
  uid: string;
  name: string;
  email: string;
  rollNumber: string;
  role: 'student' | 'admin';
}

interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  type: 'overdue' | 'system';
}

// Notification Bell Component
function NotificationBell() {
  const { notifications, markNotificationRead } = useFirebase();
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="p-2 relative text-neutral-500 hover:bg-neutral-100 rounded-full transition-colors"
      >
        <Bell size={24} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>
        )}
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-neutral-100 z-50 overflow-hidden"
            >
              <div className="p-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50">
                <h3 className="font-bold">Notifications</h3>
                {unreadCount > 0 && <span className="text-xs bg-neutral-900 text-white px-2 py-1 rounded-full">{unreadCount} new</span>}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-neutral-500 text-sm">No notifications yet.</div>
                ) : (
                  notifications.map(n => (
                    <div 
                      key={n.id} 
                      onClick={() => { if(!n.read) markNotificationRead(n.id); }} 
                      className={`p-4 border-b border-neutral-50 cursor-pointer transition-colors ${n.read ? 'bg-white hover:bg-neutral-50' : 'bg-blue-50/50 hover:bg-blue-50'}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <h4 className={`text-sm ${n.read ? 'font-medium text-neutral-700' : 'font-bold text-neutral-900'}`}>{n.title}</h4>
                        <span className="text-[10px] text-neutral-400">{format(new Date(n.createdAt), 'MMM d')}</span>
                      </div>
                      <p className={`text-xs ${n.read ? 'text-neutral-500' : 'text-neutral-700'}`}>{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// Error Boundary
class ErrorBoundary extends Component<any, any> {
  public state: any;
  public props: any;
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message };
  }

  render() {
    if (this.state.hasError) {
      let displayError = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.errorInfo || "{}");
        if (parsed.error) displayError = parsed.error;
      } catch (e) {
        displayError = this.state.errorInfo || displayError;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-red-50">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center">
            <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
            <h2 className="text-2xl font-bold mb-2">Application Error</h2>
            <p className="text-neutral-600 mb-6">{displayError}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-neutral-900 text-white rounded-full font-bold hover:bg-neutral-800 transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Firebase Context
interface FirebaseContextType {
  user: UserProfile | null;
  loading: boolean;
  books: BookData[];
  transactions: Transaction[];
  users: UserProfile[];
  notifications: AppNotification[];
  login: () => Promise<void>;
  logout: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

function FirebaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [books, setBooks] = useState<BookData[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            setUser(userDoc.data() as UserProfile);
          } else {
            // New user - default to student
            const newUser: UserProfile = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || 'New User',
              email: firebaseUser.email || '',
              rollNumber: '',
              role: firebaseUser.email === 'patrasatyabratahot@gmail.com' ? 'admin' : 'student'
            };
            await setDoc(userDocRef, newUser);
            setUser(newUser);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    const unsubscribeBooks = onSnapshot(collection(db, 'books'), (snapshot) => {
      const booksList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as BookData));
      setBooks(booksList);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'books'));

    return () => {
      unsubscribeAuth();
      unsubscribeBooks();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setTransactions([]);
      setUsers([]);
      setNotifications([]);
      return;
    }

    let transQuery;
    let unsubscribeUsers = () => {};

    if (user.role === 'admin') {
      transQuery = collection(db, 'transactions');
      
      unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        const usersList = snapshot.docs.map(doc => doc.data() as UserProfile);
        setUsers(usersList);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));
    } else {
      transQuery = query(collection(db, 'transactions'), where('userId', '==', user.uid));
    }

    const unsubscribeTransactions = onSnapshot(transQuery, (snapshot) => {
      const transList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Transaction));
      setTransactions(transList);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'transactions'));

    const notifQuery = query(collection(db, 'notifications'), where('userId', '==', user.uid));
    const unsubscribeNotifications = onSnapshot(notifQuery, (snapshot) => {
      const notifsList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as AppNotification));
      notifsList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotifications(notifsList);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'notifications'));

    return () => {
      unsubscribeTransactions();
      unsubscribeUsers();
      unsubscribeNotifications();
    };
  }, [user]);

  const login = async () => {
    await signInWithGoogle();
  };

  const logout = async () => {
    await firebaseLogout();
  };

  const markNotificationRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notifications/${id}`);
    }
  };

  return (
    <FirebaseContext.Provider value={{ user, loading, books, transactions, users, notifications, login, logout, markNotificationRead }}>
      {children}
    </FirebaseContext.Provider>
  );
}

const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (!context) throw new Error("useFirebase must be used within a FirebaseProvider");
  return context;
};

export default function App() {
  return (
    <ErrorBoundary>
      <FirebaseProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </FirebaseProvider>
    </ErrorBoundary>
  );
}

function AppRoutes() {
  const { user, loading, logout } = useFirebase();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-neutral-200 border-t-neutral-900 rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 font-sans text-neutral-900">
      <Routes>
        <Route path="/" element={<Home user={user} />} />
        <Route path="/login" element={<Login user={user} />} />
        <Route 
          path="/student/*" 
          element={user?.role === 'student' ? <StudentDashboard user={user} onLogout={logout} /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/admin/*" 
          element={user?.role === 'admin' ? <AdminDashboard user={user} onLogout={logout} /> : <Navigate to="/login" />} 
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function Home({ user }: { user: UserProfile | null }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
      <motion.img 
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        src={HIT_LOGO_URL} 
        alt="HIT Logo" 
        className="h-24 md:h-36 w-auto mb-8 object-contain drop-shadow-sm"
        referrerPolicy="no-referrer"
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h1 className="text-5xl font-bold tracking-tight mb-4 text-neutral-900">HIT Civil Library</h1>
        <p className="text-xl text-neutral-500 mb-10 max-w-lg mx-auto leading-relaxed">
          The official library management portal for the Department of Civil Engineering, Haldia Institute of Technology.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {user ? (
            <Link 
              to={user.role === 'admin' ? "/admin" : "/student"} 
              className="px-8 py-4 bg-neutral-900 text-white rounded-full font-semibold hover:bg-neutral-800 transition-all flex items-center justify-center gap-2 shadow-lg shadow-neutral-200"
            >
              Go to Dashboard <ArrowRight size={20} />
            </Link>
          ) : (
            <Link 
              to="/login" 
              className="px-8 py-4 bg-neutral-900 text-white rounded-full font-semibold hover:bg-neutral-800 transition-all flex items-center justify-center gap-2 shadow-lg shadow-neutral-200"
            >
              Login to Access <LogIn size={20} />
            </Link>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function Login({ user }: { user: UserProfile | null }) {
  const navigate = useNavigate();
  const { login } = useFirebase();

  useEffect(() => {
    if (user) {
      navigate(user.role === 'admin' ? "/admin" : "/student");
    }
  }, [user, navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-neutral-50">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md p-10 bg-white rounded-[2rem] shadow-xl shadow-neutral-200/50 border border-neutral-100"
      >
        <div className="flex justify-center mb-8">
          <img src={HIT_LOGO_URL} alt="HIT Logo" className="h-20 w-auto object-contain drop-shadow-sm" referrerPolicy="no-referrer" />
        </div>
        <h2 className="text-3xl font-bold mb-2 text-center">Welcome Back</h2>
        <p className="text-neutral-500 text-center mb-10">Sign in with your HIT Google account</p>
        
        <div className="space-y-4">
          <button 
            onClick={login}
            className="w-full py-4 px-6 bg-white border-2 border-neutral-100 rounded-2xl font-semibold hover:border-neutral-900 hover:bg-neutral-50 transition-all flex items-center justify-center gap-3 group"
          >
            <LogIn size={20} className="text-neutral-400 group-hover:text-neutral-900" />
            <span>Sign in with Google</span>
          </button>
        </div>

        <div className="mt-10 pt-6 border-t border-neutral-50 text-center">
          <p className="text-xs text-neutral-400 uppercase tracking-widest font-bold">
            Department of Civil Engineering
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function StudentDashboard({ user, onLogout }: { user: UserProfile, onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'books' | 'history'>('dashboard');
  const { books, transactions } = useFirebase();
  const [searchQuery, setSearchQuery] = useState("");
  const [showProfileSetup, setShowProfileSetup] = useState(!user.rollNumber);
  const [rollInput, setRollInput] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const studentTransactions = transactions.filter(t => t.userId === user.uid);
  const issuedBooks = studentTransactions.filter(t => t.status === 'issued');
  
  const handleProfileSetup = async () => {
    if (!rollInput) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { rollNumber: rollInput });
      setShowProfileSetup(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };
  
  const calculateFine = (dueDate: string, returnDate?: string) => {
    const end = returnDate ? new Date(returnDate) : new Date();
    const due = new Date(dueDate);
    if (isAfter(end, due)) {
      return differenceInDays(end, due);
    }
    return 0;
  };

  const filteredBooks = books.filter(b => 
    b.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    b.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.isbn.includes(searchQuery)
  );

  const NavLinks = () => (
    <>
      <button 
        onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'dashboard' ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-200' : 'text-neutral-500 hover:bg-neutral-50'}`}
      >
        <LayoutDashboard size={20} /> Dashboard
      </button>
      <button 
        onClick={() => { setActiveTab('books'); setIsMobileMenuOpen(false); }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'books' ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-200' : 'text-neutral-500 hover:bg-neutral-50'}`}
      >
        <Book size={20} /> Browse Books
      </button>
      <button 
        onClick={() => { setActiveTab('history'); setIsMobileMenuOpen(false); }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'history' ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-200' : 'text-neutral-500 hover:bg-neutral-50'}`}
      >
        <History size={20} /> My History
      </button>
    </>
  );

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {/* Profile Setup Modal */}
      {showProfileSetup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2.5rem] p-10 w-full max-w-md shadow-2xl text-center"
          >
            <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <User size={40} />
            </div>
            <h2 className="text-2xl font-bold mb-2">Complete Your Profile</h2>
            <p className="text-neutral-500 mb-8">Please enter your University Roll Number to access library services.</p>
            
            <div className="space-y-4 text-left">
              <div>
                <label className="block text-sm font-bold mb-2">Roll Number</label>
                <input 
                  type="text" 
                  placeholder="e.g. 123456789"
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  value={rollInput}
                  onChange={(e) => setRollInput(e.target.value)}
                />
              </div>
              <button 
                onClick={handleProfileSetup}
                disabled={!rollInput}
                className="w-full py-4 bg-neutral-900 text-white rounded-full font-bold hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save & Continue
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-neutral-100 flex items-center justify-between px-4 z-40">
        <img src={HIT_LOGO_URL} alt="Logo" className="h-8 w-auto object-contain" />
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-neutral-600">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden fixed inset-0 top-16 bg-white z-30 p-4 flex flex-col"
          >
            <nav className="flex-1 space-y-2">
              <NavLinks />
            </nav>
            <button 
              onClick={onLogout}
              className="flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 rounded-xl font-medium transition-colors mt-auto"
            >
              <LogOut size={20} /> Logout
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className="w-64 bg-white border-r border-neutral-100 hidden md:flex flex-col p-6">
        <div className="flex flex-col items-center gap-3 mb-10">
          <img src={HIT_LOGO_URL} alt="Logo" className="w-full h-auto object-contain px-2" />
        </div>
        
        <nav className="flex-1 space-y-2">
          <NavLinks />
        </nav>

        <button 
          onClick={onLogout}
          className="flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 rounded-xl font-medium transition-colors mt-auto"
        >
          <LogOut size={20} /> Logout
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 pt-20 md:pt-8 overflow-y-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div>
            <h1 className="text-3xl font-bold">Hello, {user.name}</h1>
            <p className="text-neutral-500">Roll: {user.rollNumber}</p>
          </div>
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="relative w-full md:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
              <input 
                type="text" 
                placeholder="Search books..." 
                className="pl-10 pr-4 py-2 bg-white border border-neutral-200 rounded-full focus:outline-none focus:ring-2 focus:ring-neutral-900 transition-all w-full md:w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <NotificationBell />
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              <div className="lg:col-span-2 space-y-8">
                <section>
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Book size={22} className="text-blue-500" /> Currently Issued
                  </h2>
                  {issuedBooks.length === 0 ? (
                    <div className="bg-white p-10 rounded-3xl border border-dashed border-neutral-200 text-center">
                      <Book className="mx-auto mb-4 text-neutral-300" size={48} />
                      <p className="text-neutral-500">You have no books currently issued.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {issuedBooks.map(book => {
                        const fine = calculateFine(book.dueDate);
                        return (
                          <div key={book.id} className="bg-white p-6 rounded-3xl border border-neutral-100 shadow-sm">
                            <h3 className="font-bold text-lg mb-1">{book.bookTitle}</h3>
                            <p className="text-neutral-500 text-sm mb-4">Due: {format(new Date(book.dueDate), 'PPP')}</p>
                            <div className="flex justify-between items-center">
                              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${fine > 0 ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                {fine > 0 ? 'Overdue' : 'Issued'}
                              </span>
                              {fine > 0 && (
                                <span className="text-red-500 font-bold flex items-center gap-1">
                                  <IndianRupee size={14} /> {fine} Fine
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>

              <div className="space-y-8">
                <section className="bg-neutral-900 text-white p-8 rounded-[2rem] shadow-xl shadow-neutral-200">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <AlertCircle size={20} className="text-yellow-400" /> Library Rules
                  </h3>
                  <ul className="space-y-3 text-sm text-neutral-300">
                    <li className="flex gap-2">
                      <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full mt-1.5 shrink-0" />
                      Books are issued for 7 days.
                    </li>
                    <li className="flex gap-2">
                      <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full mt-1.5 shrink-0" />
                      Fine of ₹1 per day after due date.
                    </li>
                    <li className="flex gap-2">
                      <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full mt-1.5 shrink-0" />
                      Maximum 3 books can be issued.
                    </li>
                  </ul>
                </section>
              </div>
            </motion.div>
          )}

          {activeTab === 'books' && (
            <motion.div 
              key="books"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {filteredBooks.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredBooks.map(book => (
                    <div key={book.id} className="bg-white p-6 rounded-3xl border border-neutral-100 shadow-sm hover:shadow-md transition-shadow">
                      <div className="p-3 bg-neutral-50 text-neutral-400 rounded-2xl w-fit mb-4">
                        <Book size={24} />
                      </div>
                      <h3 className="font-bold text-lg mb-1">{book.title}</h3>
                      <p className="text-neutral-500 text-sm mb-4">by {book.author}</p>
                      <div className="flex justify-between items-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${book.availableCopies > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                          {book.availableCopies > 0 ? `${book.availableCopies} Available` : 'Out of Stock'}
                        </span>
                        <span className="text-xs text-neutral-400 font-mono">{book.isbn}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white p-12 rounded-3xl border border-neutral-100 shadow-sm text-center">
                  <Book className="mx-auto mb-4 text-neutral-300" size={48} />
                  <h3 className="text-xl font-bold mb-2">No books found</h3>
                  <p className="text-neutral-500">We couldn't find any books matching your search criteria.</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden"
            >
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-100">
                    <th className="px-6 py-4 font-bold text-sm uppercase tracking-wider">Book</th>
                    <th className="px-6 py-4 font-bold text-sm uppercase tracking-wider">Issue Date</th>
                    <th className="px-6 py-4 font-bold text-sm uppercase tracking-wider">Return Date</th>
                    <th className="px-6 py-4 font-bold text-sm uppercase tracking-wider">Fine Paid</th>
                    <th className="px-6 py-4 font-bold text-sm uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {studentTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-neutral-500">
                        <History className="mx-auto mb-3 text-neutral-300" size={32} />
                        <p className="font-medium">No transaction history found.</p>
                        <p className="text-sm mt-1">Books you borrow will appear here.</p>
                      </td>
                    </tr>
                  ) : (
                    studentTransactions.map(t => (
                      <tr key={t.id} className="hover:bg-neutral-50/50 transition-colors">
                        <td className="px-6 py-4 font-medium">{t.bookTitle}</td>
                        <td className="px-6 py-4 text-sm text-neutral-500">{format(new Date(t.issueDate), 'MMM d, yyyy')}</td>
                        <td className="px-6 py-4 text-sm text-neutral-500">
                          {t.returnDate ? format(new Date(t.returnDate), 'MMM d, yyyy') : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold">₹{t.fine}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${t.status === 'issued' ? 'bg-blue-50 text-blue-600' : 'bg-neutral-100 text-neutral-400'}`}>
                            {t.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function AdminDashboard({ user, onLogout }: { user: UserProfile, onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'scan' | 'books' | 'transactions' | 'students'>('overview');
  const { books, transactions, users } = useFirebase();
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ type: 'book' | 'student', data: any } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBook, setNewBook] = useState({ title: '', author: '', isbn: '', category: '', totalCopies: 1 });
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");

  const students = users.filter(u => u.role === 'student');
  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(studentSearchQuery.toLowerCase()) || 
    s.rollNumber.toLowerCase().includes(studentSearchQuery.toLowerCase())
  );

  // Automated Overdue Check
  useEffect(() => {
    const checkOverdue = async () => {
      const now = new Date();
      const overdueTransactions = transactions.filter(t => 
        t.status === 'issued' && 
        isAfter(now, new Date(t.dueDate)) &&
        (!t.lastNotifiedAt || differenceInDays(now, new Date(t.lastNotifiedAt)) >= 1)
      );

      for (const t of overdueTransactions) {
        try {
          // Notify student
          const studentNotifRef = doc(collection(db, 'notifications'));
          await setDoc(studentNotifRef, {
            userId: t.userId,
            title: 'Overdue Book Alert',
            message: `Your book "${t.bookTitle}" was due on ${format(new Date(t.dueDate), 'MMM d, yyyy')}. Please return it to avoid further fines.`,
            createdAt: now.toISOString(),
            read: false,
            type: 'overdue'
          });

          // Notify admin
          const adminNotifRef = doc(collection(db, 'notifications'));
          await setDoc(adminNotifRef, {
            userId: user.uid,
            title: 'Student Overdue Book',
            message: `${t.userName} (${t.rollNumber}) has an overdue book: "${t.bookTitle}".`,
            createdAt: now.toISOString(),
            read: false,
            type: 'overdue'
          });

          // Update transaction
          await updateDoc(doc(db, 'transactions', t.id), {
            lastNotifiedAt: now.toISOString()
          });
        } catch (error) {
          console.error("Failed to send overdue notification:", error);
        }
      }
    };

    if (transactions.length > 0) {
      checkOverdue();
    }
  }, [transactions, user.uid]);

  // Fine calculation logic
  const calculateFine = (dueDate: string, returnDate?: string) => {
    const end = returnDate ? new Date(returnDate) : new Date();
    const due = new Date(dueDate);
    if (isAfter(end, due)) {
      return differenceInDays(end, due);
    }
    return 0;
  };

  const startScanner = () => {
    setScanning(true);
    setScanResult(null);
    setTimeout(() => {
      const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 }, false);
      scanner.render(onScanSuccess, onScanError);
      scannerRef.current = scanner;
    }, 100);
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.clear();
      scannerRef.current = null;
    }
    setScanning(false);
  };

  const onScanSuccess = (decodedText: string) => {
    stopScanner();
    
    // Check if it's a book ISBN
    const book = books.find(b => b.isbn === decodedText);
    if (book) {
      setScanResult({ type: 'book', data: book });
      return;
    }

    // Check if it's a student roll number (mock logic)
    if (decodedText.length >= 6) {
      setScanResult({ type: 'student', data: { rollNumber: decodedText, name: 'Scanned Student' } });
      return;
    }

    alert("Unknown barcode format.");
  };

  const onScanError = (err: any) => {};

  const issueBook = async (bookId: string, studentRoll: string) => {
    const book = books.find(b => b.id === bookId);
    if (!book || book.availableCopies <= 0) {
      alert("Book not available.");
      return;
    }

    try {
      // Find student by roll number
      const q = query(collection(db, 'users'), where('rollNumber', '==', studentRoll));
      const studentSnap = await getDocs(q);
      
      let studentData = { uid: 'unknown', name: 'Unknown Student' };
      if (!studentSnap.empty) {
        const s = studentSnap.docs[0].data();
        studentData = { uid: s.uid, name: s.name };
      }

      const transId = Math.random().toString(36).substr(2, 9);
      const newTransaction: Transaction = {
        id: transId,
        bookId: book.id,
        bookTitle: book.title,
        userId: studentData.uid,
        userName: studentData.name,
        rollNumber: studentRoll,
        issueDate: new Date().toISOString(),
        dueDate: addDays(new Date(), 7).toISOString(),
        status: 'issued',
        fine: 0
      };

      await setDoc(doc(db, 'transactions', transId), newTransaction);
      await updateDoc(doc(db, 'books', book.id), { availableCopies: book.availableCopies - 1 });
      
      setScanResult(null);
      alert("Book issued successfully!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'transactions');
    }
  };

  const returnBook = async (transactionId: string) => {
    const transaction = transactions.find(t => t.id === transactionId);
    if (!transaction) return;

    const fine = calculateFine(transaction.dueDate);
    
    try {
      await updateDoc(doc(db, 'transactions', transactionId), { 
        status: 'returned', 
        returnDate: new Date().toISOString(),
        fine 
      });

      const book = books.find(b => b.id === transaction.bookId);
      if (book) {
        await updateDoc(doc(db, 'books', transaction.bookId), { availableCopies: book.availableCopies + 1 });
      }
      alert(`Book returned. Fine: ₹${fine}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `transactions/${transactionId}`);
    }
  };

  const reissueBook = async (transactionId: string) => {
    const transaction = transactions.find(t => t.id === transactionId);
    if (!transaction) return;

    const fine = calculateFine(transaction.dueDate);
    if (fine > 0) {
      alert(`Please pay the fine of ₹${fine} before reissuing.`);
      return;
    }

    try {
      await updateDoc(doc(db, 'transactions', transactionId), { 
        issueDate: new Date().toISOString(),
        dueDate: addDays(new Date(), 7).toISOString(),
      });
      alert("Book reissued for 7 more days.");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `transactions/${transactionId}`);
    }
  };

  const addBook = async () => {
    if (!newBook.title || !newBook.author || !newBook.isbn) {
      alert("Please fill all fields");
      return;
    }
    const bookId = Math.random().toString(36).substr(2, 9);
    const book: BookData = {
      id: bookId,
      ...newBook,
      availableCopies: newBook.totalCopies
    };
    
    try {
      await setDoc(doc(db, 'books', bookId), book);
      setShowAddModal(false);
      setNewBook({ title: '', author: '', isbn: '', category: '', totalCopies: 1 });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'books');
    }
  };

  const deleteBook = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this book?")) {
      try {
        await deleteDoc(doc(db, 'books', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `books/${id}`);
      }
    }
  };

  const NavLinks = () => (
    <>
      <button 
        onClick={() => { setActiveTab('overview'); setIsMobileMenuOpen(false); }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'overview' ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-200' : 'text-neutral-500 hover:bg-neutral-50'}`}
      >
        <LayoutDashboard size={20} /> Overview
      </button>
      <button 
        onClick={() => { setActiveTab('scan'); setIsMobileMenuOpen(false); }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'scan' ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-200' : 'text-neutral-500 hover:bg-neutral-50'}`}
      >
        <QrCode size={20} /> Scan & Process
      </button>
      <button 
        onClick={() => { setActiveTab('books'); setIsMobileMenuOpen(false); }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'books' ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-200' : 'text-neutral-500 hover:bg-neutral-50'}`}
      >
        <Book size={20} /> Manage Books
      </button>
      <button 
        onClick={() => { setActiveTab('transactions'); setIsMobileMenuOpen(false); }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'transactions' ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-200' : 'text-neutral-500 hover:bg-neutral-50'}`}
      >
        <History size={20} /> Transactions
      </button>
      <button 
        onClick={() => { setActiveTab('students'); setIsMobileMenuOpen(false); }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'students' ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-200' : 'text-neutral-500 hover:bg-neutral-50'}`}
      >
        <User size={20} /> Students
      </button>
    </>
  );

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-neutral-100 flex items-center justify-between px-4 z-40">
        <img src={HIT_LOGO_URL} alt="Logo" className="h-8 w-auto object-contain" />
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-neutral-600">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden fixed inset-0 top-16 bg-white z-30 p-4 flex flex-col"
          >
            <nav className="flex-1 space-y-2">
              <NavLinks />
            </nav>
            <button 
              onClick={onLogout}
              className="flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 rounded-xl font-medium transition-colors mt-auto"
            >
              <LogOut size={20} /> Logout
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className="w-64 bg-white border-r border-neutral-100 hidden md:flex flex-col p-6">
        <div className="flex flex-col items-center gap-3 mb-10">
          <img src={HIT_LOGO_URL} alt="Logo" className="w-full h-auto object-contain px-2" />
        </div>
        
        <nav className="flex-1 space-y-2">
          <NavLinks />
        </nav>

        <button 
          onClick={onLogout}
          className="flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 rounded-xl font-medium transition-colors mt-auto"
        >
          <LogOut size={20} /> Logout
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 pt-20 md:pt-8 overflow-y-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div>
            <h1 className="text-3xl font-bold capitalize">{activeTab}</h1>
            <p className="text-neutral-500">Library Administration Panel</p>
          </div>
          <div className="flex items-center gap-4 w-full md:w-auto">
            {activeTab === 'books' && (
              <button 
                onClick={() => setShowAddModal(true)}
                className="px-6 py-3 bg-neutral-900 text-white rounded-full font-bold hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-200 flex items-center gap-2"
              >
                <Plus size={20} /> Add New Book
              </button>
            )}
            {activeTab === 'students' && (
              <div className="relative w-full md:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Search students by name or roll..." 
                  className="pl-10 pr-4 py-2 bg-white border border-neutral-200 rounded-full focus:outline-none focus:ring-2 focus:ring-neutral-900 transition-all w-full md:w-64"
                  value={studentSearchQuery}
                  onChange={(e) => setStudentSearchQuery(e.target.value)}
                />
              </div>
            )}
            <NotificationBell />
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div 
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              <div className="bg-white p-8 rounded-3xl border border-neutral-100 shadow-sm">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl w-fit mb-4">
                  <Book size={24} />
                </div>
                <p className="text-neutral-500 font-medium mb-1">Total Books</p>
                <h3 className="text-3xl font-bold">{books.length}</h3>
              </div>
              <div className="bg-white p-8 rounded-3xl border border-neutral-100 shadow-sm">
                <div className="p-3 bg-green-50 text-green-600 rounded-2xl w-fit mb-4">
                  <CheckCircle size={24} />
                </div>
                <p className="text-neutral-500 font-medium mb-1">Active Issues</p>
                <h3 className="text-3xl font-bold">{transactions.filter(t => t.status === 'issued').length}</h3>
              </div>
              <div className="bg-white p-8 rounded-3xl border border-neutral-100 shadow-sm">
                <div className="p-3 bg-red-50 text-red-600 rounded-2xl w-fit mb-4">
                  <IndianRupee size={24} />
                </div>
                <p className="text-neutral-500 font-medium mb-1">Pending Fines</p>
                <h3 className="text-3xl font-bold">₹{transactions.reduce((acc, t) => acc + calculateFine(t.dueDate, t.returnDate), 0)}</h3>
              </div>
            </motion.div>
          )}

          {activeTab === 'scan' && (
            <motion.div 
              key="scan"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-2xl mx-auto"
            >
              <div className="bg-white p-10 rounded-[2.5rem] shadow-xl shadow-neutral-200/50 border border-neutral-100 text-center">
                {!scanResult ? (
                  <>
                    <div className="mb-8">
                      <div className="w-20 h-20 bg-neutral-900 text-white rounded-3xl flex items-center justify-center mx-auto mb-4">
                        <QrCode size={40} />
                      </div>
                      <h2 className="text-2xl font-bold">Barcode Scanner</h2>
                      <p className="text-neutral-500">Scan book ISBN or Student ID to process transactions</p>
                    </div>

                    {!scanning ? (
                      <button 
                        onClick={startScanner}
                        className="px-10 py-4 bg-neutral-900 text-white rounded-full font-bold hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-200"
                      >
                        Start Scanner
                      </button>
                    ) : (
                      <div className="space-y-6">
                        <div id="reader" className="overflow-hidden rounded-2xl border-2 border-neutral-100"></div>
                        <button 
                          onClick={stopScanner}
                          className="px-8 py-3 bg-red-50 text-red-600 rounded-full font-bold hover:bg-red-100 transition-all"
                        >
                          Cancel Scanning
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-left space-y-6">
                    <div className="flex items-center gap-4 p-6 bg-neutral-50 rounded-2xl border border-neutral-100">
                      <div className={`p-3 rounded-xl ${scanResult.type === 'book' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                        {scanResult.type === 'book' ? <Book size={24} /> : <User size={24} />}
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">{scanResult.type} Scanned</p>
                        <h3 className="text-xl font-bold">{scanResult.type === 'book' ? scanResult.data.title : scanResult.data.name}</h3>
                        <p className="text-neutral-500 text-sm">{scanResult.type === 'book' ? `ISBN: ${scanResult.data.isbn}` : `Roll: ${scanResult.data.rollNumber}`}</p>
                      </div>
                    </div>

                    {scanResult.type === 'book' && (
                      <div className="space-y-4">
                        <h4 className="font-bold">Process for Student:</h4>
                        <input 
                          type="text" 
                          placeholder="Enter Student Roll Number" 
                          className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900"
                          id="student-roll"
                        />
                        <div className="flex gap-3">
                          <button 
                            onClick={() => {
                              const roll = (document.getElementById('student-roll') as HTMLInputElement).value;
                              if (roll) issueBook(scanResult.data.id, roll);
                              else alert("Please enter roll number");
                            }}
                            className="flex-1 py-3 bg-neutral-900 text-white rounded-xl font-bold hover:bg-neutral-800 transition-all"
                          >
                            Issue Book
                          </button>
                          <button 
                            onClick={() => {
                              const trans = transactions.find(t => t.bookId === scanResult.data.id && t.status === 'issued');
                              if (trans) returnBook(trans.id);
                              else alert("This book is not currently issued.");
                            }}
                            className="flex-1 py-3 bg-white border border-neutral-200 text-neutral-900 rounded-xl font-bold hover:bg-neutral-50 transition-all"
                          >
                            Return Book
                          </button>
                        </div>
                      </div>
                    )}

                    <button 
                      onClick={() => setScanResult(null)}
                      className="w-full py-3 text-neutral-400 font-medium hover:text-neutral-900 transition-colors"
                    >
                      Scan Another
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'books' && (
            <motion.div 
              key="books"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-100">
                      <th className="px-6 py-4 font-bold text-sm uppercase tracking-wider">Title</th>
                      <th className="px-6 py-4 font-bold text-sm uppercase tracking-wider">Author</th>
                      <th className="px-6 py-4 font-bold text-sm uppercase tracking-wider">ISBN</th>
                      <th className="px-6 py-4 font-bold text-sm uppercase tracking-wider">Available</th>
                      <th className="px-6 py-4 font-bold text-sm uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {books.length > 0 ? (
                      books.map(book => (
                        <tr key={book.id} className="hover:bg-neutral-50/50 transition-colors">
                          <td className="px-6 py-4 font-medium">{book.title}</td>
                          <td className="px-6 py-4 text-neutral-500">{book.author}</td>
                          <td className="px-6 py-4 font-mono text-xs">{book.isbn}</td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${book.availableCopies > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                              {book.availableCopies} / {book.totalCopies}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => deleteBook(book.id)}
                              className="p-2 text-neutral-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-neutral-500">
                          <Book className="mx-auto mb-3 text-neutral-300" size={32} />
                          <p className="font-medium">No books available in the library.</p>
                          <p className="text-sm mt-1">Click "Add New Book" to start building your catalog.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'transactions' && (
            <motion.div 
              key="transactions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-100">
                      <th className="px-6 py-4 font-bold text-sm uppercase tracking-wider">Book</th>
                      <th className="px-6 py-4 font-bold text-sm uppercase tracking-wider">Student</th>
                      <th className="px-6 py-4 font-bold text-sm uppercase tracking-wider">Due Date</th>
                      <th className="px-6 py-4 font-bold text-sm uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 font-bold text-sm uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {transactions.length > 0 ? (
                      transactions.map(t => (
                        <tr key={t.id} className="hover:bg-neutral-50/50 transition-colors">
                          <td className="px-6 py-4 font-medium">{t.bookTitle}</td>
                          <td className="px-6 py-4">
                            <p className="font-medium">{t.userName}</p>
                            <p className="text-xs text-neutral-400">{t.rollNumber}</p>
                          </td>
                          <td className="px-6 py-4 text-sm text-neutral-500">{format(new Date(t.dueDate), 'MMM d, yyyy')}</td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${t.status === 'issued' ? 'bg-blue-50 text-blue-600' : 'bg-neutral-100 text-neutral-400'}`}>
                              {t.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {t.status === 'issued' && (
                              <div className="flex justify-end gap-2">
                                <button 
                                  onClick={() => reissueBook(t.id)}
                                  className="px-3 py-1 bg-neutral-900 text-white rounded-lg text-xs font-bold hover:bg-neutral-800 transition-all"
                                >
                                  Reissue
                                </button>
                                <button 
                                  onClick={() => returnBook(t.id)}
                                  className="px-3 py-1 bg-white border border-neutral-200 text-neutral-900 rounded-lg text-xs font-bold hover:bg-neutral-50 transition-all"
                                >
                                  Return
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-neutral-500">
                          <History className="mx-auto mb-3 text-neutral-300" size={32} />
                          <p className="font-medium">No transactions found.</p>
                          <p className="text-sm mt-1">Book issues and returns will appear here.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'students' && (
            <motion.div 
              key="students"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-100">
                      <th className="px-6 py-4 font-bold text-sm uppercase tracking-wider">Name</th>
                      <th className="px-6 py-4 font-bold text-sm uppercase tracking-wider">Roll Number</th>
                      <th className="px-6 py-4 font-bold text-sm uppercase tracking-wider">Email</th>
                      <th className="px-6 py-4 font-bold text-sm uppercase tracking-wider">Active Issues</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {filteredStudents.length > 0 ? (
                      filteredStudents.map(student => {
                        const activeIssues = transactions.filter(t => t.userId === student.uid && t.status === 'issued').length;
                        return (
                          <tr key={student.uid} className="hover:bg-neutral-50/50 transition-colors">
                            <td className="px-6 py-4 font-medium">{student.name}</td>
                            <td className="px-6 py-4 font-mono text-sm">{student.rollNumber || 'Not Set'}</td>
                            <td className="px-6 py-4 text-neutral-500 text-sm">{student.email}</td>
                            <td className="px-6 py-4">
                              <span className={`px-3 py-1 rounded-full text-xs font-bold ${activeIssues > 0 ? 'bg-blue-50 text-blue-600' : 'bg-neutral-100 text-neutral-500'}`}>
                                {activeIssues} Books
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-neutral-500">
                          <User className="mx-auto mb-3 text-neutral-300" size={32} />
                          <p className="font-medium">No students found.</p>
                          <p className="text-sm mt-1">Try adjusting your search query.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add Book Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[2.5rem] p-10 w-full max-w-md shadow-2xl"
            >
              <h2 className="text-2xl font-bold mb-6">Add New Book</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold mb-2">Title</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    value={newBook.title}
                    onChange={(e) => setNewBook({...newBook, title: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">Author</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    value={newBook.author}
                    onChange={(e) => setNewBook({...newBook, author: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">ISBN / Barcode</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    value={newBook.isbn}
                    onChange={(e) => setNewBook({...newBook, isbn: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">Category</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    value={newBook.category}
                    onChange={(e) => setNewBook({...newBook, category: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">Total Copies</label>
                  <input 
                    type="number" 
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    value={newBook.totalCopies}
                    onChange={(e) => setNewBook({...newBook, totalCopies: parseInt(e.target.value)})}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-4 bg-neutral-100 text-neutral-900 rounded-full font-bold hover:bg-neutral-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={addBook}
                  className="flex-1 py-4 bg-neutral-900 text-white rounded-full font-bold hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-200"
                >
                  Add Book
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}
