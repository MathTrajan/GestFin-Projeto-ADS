import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}
  get<T>(url: string): Observable<T> {
    return this.http.get<T>(url, { withCredentials: true });
  }
  post<T>(url: string, body: unknown): Observable<T> {
    return this.http.post<T>(url, body, { withCredentials: true });
  }
  patch<T>(url: string, body: unknown): Observable<T> {
    return this.http.patch<T>(url, body, { withCredentials: true });
  }
  delete<T>(url: string): Observable<T> {
    return this.http.delete<T>(url, { withCredentials: true });
  }
}
